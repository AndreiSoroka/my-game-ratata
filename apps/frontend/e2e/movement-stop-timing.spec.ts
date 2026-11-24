import { writeFile } from 'node:fs/promises'

import {
    CENTER_LOCATION_ID,
    STOP_CORRECTION_BLEND_MS,
    STOP_CORRECTION_MAX_AGE_MS,
    STOP_CORRECTION_MAX_DISTANCE,
    type Vector2,
} from '@my-game-ratata/contracts'
import { expect, type Page, test, type TestInfo } from '@playwright/test'

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

const link = { uplinkMs: 35, downlinkMs: 50 }
const tolerance = 0.001
const steadyWalkMs = 1_000

const viewports = [
    { width: 390, zoom: 2 },
    { width: 1280, zoom: 4 },
]

for (const viewport of viewports) {
    test(`measures the settled stop with and without latency probes (${String(viewport.width)}px)`, async ({
        context,
        page,
    }, info) => {
        test.setTimeout(90_000)
        const baseline = await measureStop(page, viewport, false, info)
        const calibrated = await measureStop(await context.newPage(), viewport, true, info)
        expect(baseline.deliveredPongs).toBe(0)
        expect(calibrated.deliveredPongs).toBeGreaterThanOrEqual(3)
        await attachMetrics(info, 'movement-stop-timing.json', {
            ...viewport,
            ...link,
            baseline,
            calibrated,
        })
    })
}

async function measureStop(
    page: Page,
    { width, zoom }: (typeof viewports)[number],
    calibration: boolean,
    info: TestInfo
) {
    const mode = calibration ? 'calibrated' : 'baseline'
    await page.setViewportSize({ width, height: 844 })
    const wire = await captureStopWire(page, { ...link, calibration })
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    const mapResponse = page.waitForResponse((response) => {
        const path = new URL(response.url()).pathname
        return path.startsWith('/world/maps/') && path.endsWith(`/${CENTER_LOCATION_ID}.json`)
    })
    await page.evaluate(
        (name) => window.__ratataTest!.join(name, 'vanguard'),
        `stop-${calibration ? 'p' : 'c'}-${String(width)}-${Date.now().toString(36)}`
    )
    const canvas = page.locator('canvas[data-game-canvas=true]')
    await expect(canvas).toBeVisible()
    const axis = await approachMotionCorridor(
        page,
        (await (await mapResponse).json()) as MotionMapSource
    )
    expect(
        await page.evaluate((scale) => window.__ratataGameDebug!.setCameraZoom!(scale), zoom)
    ).toBe(true)
    await expect
        .poll(async () => {
            const { player } = await readMotionPose(page)
            return Math.hypot(player?.velocity.x ?? 1, player?.velocity.y ?? 1)
        })
        .toBe(0)
    if (calibration) await expect.poll(wire.deliveredPongs).toBeGreaterThanOrEqual(3)
    await canvas.focus()
    const key = movementKey(axis)
    const firstFrame = wire.frames.length
    const firstRequest = wire.requests.length
    await page.keyboard.down(key)
    try {
        await expect
            .poll(() => walkingDuration(wire.frames.slice(firstFrame), axis), {
                intervals: [40, 60, 75],
            })
            .toBeGreaterThanOrEqual(steadyWalkMs)
        const rendering = captureStopRendering(page, key)
        await page.evaluate(
            () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        )
        await page.keyboard.up(key)
        const frames = await rendering
        const requests = wire.requests.slice(firstRequest)
        expect(requests).toHaveLength(1)
        const request = requests[0]!
        const sent = wire.frames.slice(firstFrame)
        const stop = readStopResult(frames, sent, request, tolerance)
        const metrics = {
            heldWalkMs: walkingDuration(sent, axis),
            deliveredPongs: wire.deliveredPongs(),
            serverReplyMs: stop.endpoint.receivedAt - request.emittedAt,
            acknowledgementMs: stop.acknowledgementMs,
            convergenceMs: stop.convergenceMs,
            ordinaryAheadPx: along(axis, request.position, stop.beforeCorrection),
            finalAheadPx: along(axis, request.position, stop.endpoint.position),
            ordinaryGapPx: distance(request.position, stop.beforeCorrection),
            finalGapPx: stop.frozenGapPx,
            appliedCorrectionPx: stop.appliedCorrectionPx,
            status: stop.endpoint.stopCorrection!.status,
        }
        await attachMetrics(info, `stop-${mode}.json`, { ...metrics, axis, request, sent, frames })
        expect(request.axis).toEqual({ x: 0, y: 0 })
        expect(frames[0]!.drawnReference).toEqual({ streamId: request.streamId, seq: request.seq })
        expect(distance(request.position, frames[0]!.rendered)).toBeLessThan(tolerance)
        expect(
            sent.some((frame) => frame.streamId === request.streamId && frame.seq === request.seq)
        ).toBe(true)
        expect(stop.acknowledgementMs).toBeGreaterThanOrEqual(link.uplinkMs + link.downlinkMs)
        expect(stop.held.length).toBeGreaterThan(1)
        for (const frame of stop.held) {
            expect(distance(frame.rendered, request.position)).toBeLessThan(tolerance)
        }
        expect(stop.endpoint.tick - stop.previousTick).toBe(1)
        expect(stop.appliedCorrectionPx).toBeLessThanOrEqual(
            STOP_CORRECTION_MAX_DISTANCE + tolerance
        )
        expect(stop.stationaryFrames.length).toBeGreaterThan(0)
        for (const frame of stop.stationaryFrames) {
            expect(frame.position).toEqual(stop.endpoint.position)
        }
        expect(stop.stationaryFrames.at(-1)?.velocity).toEqual({ x: 0, y: 0 })
        const shouldBlend =
            metrics.acknowledgementMs < STOP_CORRECTION_MAX_AGE_MS && metrics.finalGapPx > tolerance
        expect(stop.convergenceMs).toBeGreaterThanOrEqual(
            shouldBlend ? STOP_CORRECTION_BLEND_MS / 2 : 0
        )
        expect(stop.fallbackError).toBeLessThan(tolerance)
        expect(stop.convergenceError).toBeLessThan(tolerance)
        expect(frames.at(-1)!.rendered).toEqual(stop.endpoint.position)
        return metrics
    } finally {
        await page.keyboard.up(key)
        await page.evaluate(() => window.__ratataTest!.stop())
        await page.close()
    }
}

function walkingDuration(frames: StopWireFrame[], axis: Vector2): number {
    const moving = frames.filter((frame) => along(axis, { x: 0, y: 0 }, frame.velocity) > 0)
    return (moving.at(-1)?.serverTime ?? 0) - (moving[0]?.serverTime ?? 0)
}

function along(axis: Vector2, from: Vector2, to: Vector2): number {
    return (to.x - from.x) * axis.x + (to.y - from.y) * axis.y
}

async function attachMetrics(info: TestInfo, name: string, metrics: object): Promise<void> {
    const path = info.outputPath(name)
    await writeFile(path, JSON.stringify(metrics))
    await info.attach(name, { path, contentType: 'application/json' })
}
