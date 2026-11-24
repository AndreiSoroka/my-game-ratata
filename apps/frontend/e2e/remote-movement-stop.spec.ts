import { CENTER_LOCATION_ID, type Vector2 } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

import { distance, movementKey } from './movement-stop-timing-helpers'
import {
    approachMotionCorridor,
    type MotionMapSource,
    pauseInbound,
    readMotionPose,
} from './network-motion-helpers'

const tolerance = 0.1
const canvas = 'canvas[data-game-canvas=true]'

for (const width of [390, 1280]) {
    test(`plays another player's stop smoothly after a snapshot burst (${String(width)}px)`, async ({
        baseURL,
        browser,
    }, info) => {
        test.setTimeout(90_000)
        const viewport = { width, height: 844 }
        const moverContext = await browser.newContext({ baseURL, viewport })
        const observerContext = await browser.newContext({ baseURL, viewport })
        const mover = await moverContext.newPage()
        const observer = await observerContext.newPage()
        const suffix = `${String(width)}-${Date.now().toString(36)}`
        try {
            const inbound = await pauseInbound(observer)
            const mapResponse = mover.waitForResponse((response) => {
                const path = new URL(response.url()).pathname
                return (
                    path.startsWith('/world/maps/') && path.endsWith(`/${CENTER_LOCATION_ID}.json`)
                )
            })
            const moverId = await join(mover, `mover-${suffix}`)
            const axis = await approachMotionCorridor(
                mover,
                (await (await mapResponse).json()) as MotionMapSource
            )
            const start = (await readMotionPose(mover)).player!.position
            await join(observer, `observer-${suffix}`)
            await approachObserver(observer, start, axis)
            await expect
                .poll(async () => (await observedPose(observer, moverId)).rendered)
                .toBeDefined()
            await mover.bringToFront()
            await mover.locator(canvas).focus()
            const key = movementKey(axis)
            await mover.keyboard.down(key)
            await expect
                .poll(async () =>
                    ahead(axis, start, (await readMotionPose(mover)).player!.position)
                )
                .toBeGreaterThan(60)
            inbound.pause()
            const lastDelivered = (await observedPose(observer, moverId)).confirmed!
            await expect
                .poll(async () =>
                    ahead(axis, lastDelivered, (await readMotionPose(mover)).player!.position)
                )
                .toBeGreaterThan(18)
            await mover.keyboard.up(key)

            const held = await captureRemotePlayback(observer, moverId, 320)
            const heldPose = held.at(-1)!.position
            expect(held.length).toBeGreaterThan(2)
            expect(
                held.every(({ position }) => ahead(axis, lastDelivered, position) <= tolerance)
            ).toBe(true)
            expect(distance(heldPose, lastDelivered)).toBeLessThan(tolerance)
            expect(inbound.pending()).toBeGreaterThanOrEqual(4)
            await expect
                .poll(async () => {
                    const { player, rendered } = await readMotionPose(mover)
                    return player && rendered
                        ? distance(player.position, rendered) +
                              Math.hypot(player.velocity.x, player.velocity.y)
                        : Infinity
                })
                .toBeLessThan(tolerance)
            const endpoint = (await readMotionPose(mover)).player!.position
            expect(ahead(axis, heldPose, endpoint)).toBeGreaterThan(10)

            const recording = captureRemotePlayback(observer, moverId, 1_250)
            await observer.evaluate(
                () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            )
            inbound.release()
            const resumed = await recording
            const observerPose = await observedPose(observer, moverId)
            await info.attach('remote-stop.json', {
                body: JSON.stringify({ width, axis, lastDelivered, endpoint, held, resumed }),
                contentType: 'application/json',
            })
            expect(observerPose.confirmed).toEqual(endpoint)
            expect(distance(resumed.at(-1)!.position, endpoint)).toBeLessThan(tolerance)
            expect(distance(observerPose.rendered!, endpoint)).toBeLessThan(tolerance)
            expect(
                resumed.some(
                    ({ position }) =>
                        ahead(axis, heldPose, position) > 2 && ahead(axis, position, endpoint) > 2
                )
            ).toBe(true)
            assertContinuousFrames(resumed)
        } finally {
            await moverContext.close()
            await observerContext.close()
        }
    })
}

async function join(page: Page, nickname: string): Promise<string> {
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.evaluate((name) => window.__ratataTest!.join(name, 'vanguard'), nickname)
    await expect(page.locator(canvas)).toBeVisible()
    return page.evaluate(() => window.__ratataTest!.getState().localPlayerId!)
}

async function approachObserver(observer: Page, start: Vector2, axis: Vector2): Promise<void> {
    const position = { x: start.x + axis.x * 60, y: start.y + axis.y * 60 }
    const result = await observer.evaluate(
        (point) => window.__ratataTest!.navigate(point, { tolerance: 1, timeoutMs: 20_000 }),
        position
    )
    expect(result.status, result.reason).toBe('arrived')
}

function observedPose(page: Page, actorId: string) {
    return page.evaluate((id) => {
        const confirmed = window
            .__ratataTest!.getState()
            .snapshot!.characters.find((actor) => actor.id === id)?.position
        const rendered = window.__ratataGameDebug!.renderedCharacters!().find(
            (actor) => actor.id === id
        )?.position
        return { confirmed, rendered }
    }, actorId)
}

interface RemoteFrame {
    at: number
    position: Vector2
}

function captureRemotePlayback(page: Page, actorId: string, durationMs: number) {
    return page.evaluate(
        async ({ id, duration }): Promise<RemoteFrame[]> => {
            const started = performance.now()
            const frames: RemoteFrame[] = []
            do {
                const actor = window.__ratataGameDebug!.renderedCharacters!().find(
                    (character) => character.id === id
                )
                if (!actor) throw new Error('Observed player disappeared during movement playback')
                frames.push({ at: performance.now() - started, position: actor.position })
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            } while (performance.now() - started < duration)
            return frames
        },
        { id: actorId, duration: durationMs }
    )
}

function ahead(axis: Vector2, from: Vector2, position: Vector2): number {
    return (position.x - from.x) * axis.x + (position.y - from.y) * axis.y
}

function assertContinuousFrames(frames: RemoteFrame[]): void {
    for (let index = 1; index < frames.length; index += 1) {
        const previous = frames[index - 1]!
        const frame = frames[index]!
        // Straight walking is 90 px/s. Allow extra room for a legal stop correction and sampling jitter.
        expect(distance(previous.position, frame.position)).toBeLessThanOrEqual(
            0.3 * (frame.at - previous.at) + 1
        )
    }
}
