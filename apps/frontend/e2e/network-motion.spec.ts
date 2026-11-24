import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { expect, test } from '@playwright/test'

import {
    approachMotionCorridor,
    capturePausedMotion,
    type MotionMapSource,
    pauseInbound,
    readMotionPose,
} from './network-motion-helpers'

for (const width of [390, 1280]) {
    test(`continues server movement briefly during lag, freezes and corrects with the camera (${width}px)`, async ({
        page,
    }, info) => {
        test.setTimeout(60_000)
        await page.setViewportSize({ width, height: 844 })
        const inbound = await pauseInbound(page)
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        const mapResponse = page.waitForResponse((response) => {
            const path = new URL(response.url()).pathname
            return path.startsWith('/world/maps/') && path.endsWith(`/${CENTER_LOCATION_ID}.json`)
        })
        await page.evaluate(
            (name) => window.__ratataTest!.join(name, 'vanguard'),
            `motion-${width}-${Date.now().toString(36)}`
        )
        await expect(page.locator('canvas[data-game-canvas=true]')).toBeVisible()
        const axis = await approachMotionCorridor(
            page,
            (await (await mapResponse).json()) as MotionMapSource
        )
        const beforeTick = await page.evaluate((direction) => {
            const tick = window.__ratataTest!.getState().snapshot!.tick
            window.__ratataTest!.send({ type: 'movement_mode', mode: 'walking' })
            window.__ratataTest!.send({ type: 'move_input', axis: direction })
            return tick
        }, axis)
        await expect
            .poll(async () => {
                const { player, tick } = await readMotionPose(page)
                return tick !== undefined && tick > beforeTick && player?.path.length === 0
                    ? player.velocity.x * axis.x + player.velocity.y * axis.y
                    : 0
            })
            .toBeGreaterThan(0)
        inbound.pause()
        const samples = await capturePausedMotion(page)
        await info.attach('motion-pause.json', {
            body: JSON.stringify({ width, axis, samples }),
            contentType: 'application/json',
        })
        expect(inbound.pending()).toBeGreaterThan(2)
        const first = samples[0]!
        const continued = samples.find((sample) => sample.at >= 110)!
        const frozen = samples.find((sample) => sample.at >= 300)!
        const last = samples.at(-1)!
        expect(new Set(samples.map((sample) => sample.serverTime)).size).toBe(1)
        expect((continued.x - first.x) * axis.x + (continued.y - first.y) * axis.y).toBeGreaterThan(
            1
        )
        expect(Math.hypot(last.x - frozen.x, last.y - frozen.y)).toBeLessThan(0.05)
        expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeLessThan(35)
        // A camera following the old snapshot would let the body drift on screen during this pause.
        expect(
            Math.max(
                ...samples.map((sample) =>
                    Math.hypot(sample.pageX - first.pageX, sample.pageY - first.pageY)
                )
            )
        ).toBeLessThan(2)
        await page.evaluate(() => window.__ratataTest!.send({ type: 'release_input' }))
        inbound.release()
        await expect
            .poll(async () => {
                const { player, rendered } = await readMotionPose(page)
                if (!player || !rendered) return Infinity
                return (
                    Math.hypot(player.velocity.x, player.velocity.y) +
                    Math.hypot(player.position.x - rendered.x, player.position.y - rendered.y)
                )
            })
            .toBeLessThan(0.1)
        await page.evaluate(() => window.__ratataTest!.stop())
    })
}
