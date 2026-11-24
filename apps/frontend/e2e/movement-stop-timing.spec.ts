import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { expect, test } from '@playwright/test'

import {
    backwardMotionMetrics,
    captureStopRendering,
    captureStopWire,
    isEndedPartialStep,
    movementKey,
} from './movement-stop-timing-helpers'
import {
    approachMotionCorridor,
    type MotionMapSource,
    readMotionPose,
} from './network-motion-helpers'

for (const width of [390, 1280]) {
    test(`stops held keyboard movement at server receipt time (${width}px)`, async ({
        page,
    }, info) => {
        test.setTimeout(60_000)
        await page.setViewportSize({ width, height: 844 })
        const wire = await captureStopWire(page)
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        const mapResponse = page.waitForResponse((response) => {
            const path = new URL(response.url()).pathname
            return path.startsWith('/world/maps/') && path.endsWith(`/${CENTER_LOCATION_ID}.json`)
        })
        await page.evaluate(
            (name) => window.__ratataTest!.join(name, 'vanguard'),
            `stop-${width}-${Date.now().toString(36)}`
        )
        const canvas = page.locator('canvas[data-game-canvas=true]')
        await expect(canvas).toBeVisible()
        const axis = await approachMotionCorridor(
            page,
            (await (await mapResponse).json()) as MotionMapSource
        )
        await expect
            .poll(async () => {
                const { player } = await readMotionPose(page)
                return Math.hypot(player?.velocity.x ?? 1, player?.velocity.y ?? 1)
            })
            .toBe(0)
        await canvas.focus()
        const key = movementKey(axis)
        const baseline = wire.frames.length
        await page.keyboard.down(key)
        try {
            await expect
                .poll(
                    () =>
                        wire.frames
                            .slice(baseline)
                            .filter(
                                (frame) => frame.velocity.x * axis.x + frame.velocity.y * axis.y > 0
                            ).length
                )
                .toBeGreaterThanOrEqual(10)
            const rendering = captureStopRendering(page)
            // Release within a rendered frame instead of scheduling an artificial client timestamp.
            await page.evaluate(
                () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            )
            await page.keyboard.up(key)
            const frames = await rendering
            const stopped = wire.frames
                .slice(baseline)
                .filter((frame) => frame.afterRelease && isEndedPartialStep(frame))
            const metricsFile = info.outputPath('movement-stop-timing.json')
            await writeFile(
                metricsFile,
                JSON.stringify({
                    width,
                    axis,
                    metrics: backwardMotionMetrics(frames, axis),
                    commands: wire.commands,
                    wire: wire.frames.slice(baseline),
                    rendered: frames,
                })
            )
            await info.attach('movement-stop-timing.json', {
                path: metricsFile,
                contentType: 'application/json',
            })
            expect(stopped.length).toBeGreaterThan(0)
            const endpoint = stopped[0]!
            expect(endpoint.continuationUntil).toBeLessThanOrEqual(endpoint.serverTime)
            const afterStop = wire.frames.filter((frame) => frame.tick > endpoint.tick)
            expect(afterStop.length).toBeGreaterThan(3)
            for (const frame of afterStop) expect(frame.position).toEqual(endpoint.position)
            expect(afterStop.at(-1)?.velocity).toEqual({ x: 0, y: 0 })
            const renderedStop = frames.filter((frame) => frame.tick >= endpoint.tick)
            expect(renderedStop.length).toBeGreaterThan(0)
            for (const frame of renderedStop)
                expect(
                    Math.hypot(
                        endpoint.position.x - frame.rendered.x,
                        endpoint.position.y - frame.rendered.y
                    )
                ).toBeLessThan(0.001)
            const last = frames.at(-1)!
            expect(last.rendered).toEqual(endpoint.position)
        } finally {
            await page.keyboard.up(key)
            await page.evaluate(() => window.__ratataTest!.stop())
        }
    })
}
import { writeFile } from 'node:fs/promises'
