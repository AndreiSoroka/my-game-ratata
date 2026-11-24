import { writeFile } from 'node:fs/promises'

import {
    CENTER_LOCATION_ID,
    STOP_CORRECTION_BLEND_MS,
    STOP_CORRECTION_MAX_AGE_MS,
    STOP_CORRECTION_MAX_DISTANCE,
    type Vector2,
} from '@my-game-ratata/contracts'
import { expect, test } from '@playwright/test'

import {
    captureStopRendering,
    captureStopWire,
    distance,
    movementKey,
    readStopResult,
    type StopWireFrame,
} from './movement-stop-timing-helpers'
import {
    approachMotionCorridor,
    type MotionMapSource,
    readMotionPose,
} from './network-motion-helpers'

const releaseDelayMs = 35
const receiptDelayMs = 50
const tolerance = 0.001
const steadyWalkMs = 1_000

const viewports = [
    { width: 390, zoom: 2 },
    { width: 1280, zoom: 4 },
]

for (const { width, zoom } of viewports) {
    test(`freezes held movement on release and settles at the acknowledged position (${String(width)}px)`, async ({
        page,
    }, info) => {
        test.setTimeout(60_000)
        await page.setViewportSize({ width, height: 844 })
        const wire = await captureStopWire(page, { releaseDelayMs, receiptDelayMs })
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        const mapResponse = page.waitForResponse((response) => {
            const path = new URL(response.url()).pathname
            return path.startsWith('/world/maps/') && path.endsWith(`/${CENTER_LOCATION_ID}.json`)
        })
        await page.evaluate(
            (name) => window.__ratataTest!.join(name, 'vanguard'),
            `stop-${String(width)}-${Date.now().toString(36)}`
        )
        const canvas = page.locator('canvas[data-game-canvas=true]')
        await expect(canvas).toBeVisible()
        const axis = await approachMotionCorridor(
            page,
            (await (await mapResponse).json()) as MotionMapSource
        )
        const zoomed = await page.evaluate(
            (scale) => window.__ratataGameDebug!.setCameraZoom!(scale),
            zoom
        )
        expect(zoomed).toBe(true)
        await expect
            .poll(async () => {
                const { player } = await readMotionPose(page)
                return Math.hypot(player?.velocity.x ?? 1, player?.velocity.y ?? 1)
            })
            .toBe(0)
        await canvas.focus()
        const key = movementKey(axis)
        const baseline = wire.frames.length
        const requestBaseline = wire.requests.length
        await page.keyboard.down(key)
        try {
            await expect
                .poll(() => walkingDuration(wire.frames.slice(baseline), axis), {
                    intervals: [40, 60, 75],
                })
                .toBeGreaterThanOrEqual(steadyWalkMs)
            const rendering = captureStopRendering(page, key)
            await page.evaluate(
                () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            )
            await page.keyboard.up(key)
            const frames = await rendering
            const requests = wire.requests.slice(requestBaseline)
            expect(requests).toHaveLength(1)
            const request = requests[0]!
            expect(request.axis).toEqual({ x: 0, y: 0 })
            const released = frames[0]!
            expect(distance(request.position, released.rendered)).toBeLessThan(tolerance)

            const sent = wire.frames.slice(baseline)
            const basis = sent.find(
                (frame) => frame.streamId === request.streamId && frame.seq === request.seq
            )
            expect(basis).toBeDefined()
            const stop = readStopResult(frames, sent, request, tolerance)
            const metrics = {
                width,
                zoom,
                axis,
                releaseDelayMs,
                receiptDelayMs,
                heldWalkMs: walkingDuration(sent, axis),
                serverReplyMs: stop.endpoint.receivedAt - request.emittedAt,
                acknowledgementMs: stop.acknowledgementMs,
                settledMs: stop.settledMs,
                convergenceMs: stop.convergenceMs,
                frozenGapPx: stop.frozenGapPx,
                appliedCorrectionPx: stop.appliedCorrectionPx,
                status: stop.endpoint.stopCorrection!.status,
                expiredBeforeAcknowledgement: stop.acknowledgementMs >= STOP_CORRECTION_MAX_AGE_MS,
                request,
                wire: sent,
                rendered: frames,
            }
            const metricsPath = info.outputPath('movement-stop-timing.json')
            await writeFile(metricsPath, JSON.stringify(metrics))
            await info.attach('movement-stop-timing.json', {
                path: metricsPath,
                contentType: 'application/json',
            })
            expect(stop.acknowledgementMs).toBeGreaterThanOrEqual(releaseDelayMs + receiptDelayMs)
            expect(stop.held.length).toBeGreaterThan(1)
            for (const frame of stop.held) {
                expect(distance(frame.rendered, request.position)).toBeLessThan(tolerance)
            }
            expect(stop.endpoint.tick - stop.previousTick).toBe(1)
            expect(stop.endpoint.stopCorrection?.status).not.toBe('rejected')
            expect(stop.appliedCorrectionPx).toBeGreaterThan(tolerance)
            expect(stop.appliedCorrectionPx).toBeLessThanOrEqual(
                STOP_CORRECTION_MAX_DISTANCE + tolerance
            )
            expect(stop.stationaryFrames.length).toBeGreaterThan(0)
            for (const frame of stop.stationaryFrames) {
                expect(frame.position).toEqual(stop.endpoint.position)
            }
            expect(stop.stationaryFrames.at(-1)?.velocity).toEqual({ x: 0, y: 0 })
            expect(stop.convergenceMs).toBeGreaterThanOrEqual(minimumConvergenceMs(metrics))
            expect(stop.fallbackError).toBeLessThan(tolerance)
            expect(stop.convergenceError).toBeLessThan(tolerance)
            expect(frames.at(-1)!.rendered).toEqual(stop.endpoint.position)
        } finally {
            await page.keyboard.up(key)
            await page.evaluate(() => window.__ratataTest!.stop())
        }
    })
}

function walkingDuration(frames: StopWireFrame[], axis: Vector2): number {
    const moving = frames.filter(
        (frame) => frame.velocity.x * axis.x + frame.velocity.y * axis.y > 0
    )
    return (moving.at(-1)?.serverTime ?? 0) - (moving[0]?.serverTime ?? 0)
}

function minimumConvergenceMs(metrics: {
    expiredBeforeAcknowledgement: boolean
    frozenGapPx: number
}): number {
    return !metrics.expiredBeforeAcknowledgement && metrics.frozenGapPx > tolerance
        ? STOP_CORRECTION_BLEND_MS / 2
        : 0
}
