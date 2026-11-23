import type { ClientMessage, ViewportBounds } from '@my-game-ratata/contracts'
import { BoundingBox, type Engine } from 'excalibur'
import { describe, expect, it, vi } from 'vitest'

import { RuntimeViewport } from './runtimeViewport'

function setup() {
    let now = 0
    let locationId: string | undefined = 'map-2-2'
    let bounds: ViewportBounds = { left: 10, top: -10, right: 200, bottom: 100 }
    const frames = new Set<() => void>()
    const send = vi.fn<(message: ClientMessage) => void>()
    const on = vi.fn<(event: string, callback: () => void) => void>((_event, callback) => {
        frames.add(callback)
    })
    const off = vi.fn<(event: string, callback: () => void) => void>((_event, callback) => {
        frames.delete(callback)
    })
    const engine = {
        on,
        off,
        screen: { getWorldBounds: () => bounds },
    } as unknown as Engine
    const viewport = new RuntimeViewport(
        send,
        () => locationId,
        () => now
    )
    viewport.start(engine)
    return {
        viewport,
        send,
        on,
        off,
        engine,
        frame: () => frames.forEach((callback) => callback()),
        time: (time: number) => (now = time),
        location: (id: string | undefined) => (locationId = id),
        bounds: (value: ViewportBounds) => (bounds = value),
    }
}

describe('camera viewport interest updates', () => {
    it('waits for a ready map and quantizes actual world bounds outward without adding a second margin', () => {
        const context = setup()
        context.location(undefined)
        context.frame()
        expect(context.send).not.toHaveBeenCalled()
        context.location('map-2-2')
        context.frame()
        expect(context.send).toHaveBeenCalledExactlyOnceWith({
            type: 'set_viewport',
            locationId: 'map-2-2',
            bounds: { left: 0, top: -32, right: 224, bottom: 128 },
        })
    })

    it('sends the newest moving camera bounds at most ten times per second', () => {
        const context = setup()
        context.frame()
        context.bounds({ left: 80, top: 20, right: 280, bottom: 120 })
        context.time(20)
        context.frame()
        context.bounds({ left: 140, top: 20, right: 340, bottom: 120 })
        context.time(99)
        context.frame()
        expect(context.send).toHaveBeenCalledTimes(1)
        context.time(100)
        context.frame()
        expect(context.send).toHaveBeenLastCalledWith({
            type: 'set_viewport',
            locationId: 'map-2-2',
            bounds: { left: 128, top: 0, right: 352, bottom: 128 },
        })
        expect(context.send).toHaveBeenCalledTimes(2)
    })

    it('accepts the engine bounding box instance, including its internal cached state', () => {
        const context = setup()
        const bounds = new BoundingBox(10, -10, 200, 100)
        context.bounds(bounds)
        context.frame()
        expect(context.send).toHaveBeenCalledExactlyOnceWith({
            type: 'set_viewport',
            locationId: 'map-2-2',
            bounds: { left: 0, top: -32, right: 224, bottom: 128 },
        })
    })

    it('does not resend an unchanged quantized view', () => {
        const context = setup()
        context.frame()
        context.bounds({ left: 11, top: -9, right: 201, bottom: 101 })
        context.time(500)
        context.frame()
        context.frame()
        expect(context.send).toHaveBeenCalledTimes(1)
    })

    it('updates a resized or zoomed camera even when its center stays fixed', () => {
        const context = setup()
        context.frame()
        context.time(100)
        context.bounds({ left: -10, top: -40, right: 220, bottom: 130 })
        context.frame()
        expect(context.send).toHaveBeenLastCalledWith({
            type: 'set_viewport',
            locationId: 'map-2-2',
            bounds: { left: -32, top: -64, right: 224, bottom: 160 },
        })
    })

    it.each([
        { left: Number.NaN, top: 0, right: 200, bottom: 100 },
        { left: 0, top: 0, right: Number.POSITIVE_INFINITY, bottom: 100 },
        { left: 200, top: 0, right: 100, bottom: 100 },
        { left: 0, top: 100, right: 200, bottom: 100 },
    ])('ignores invalid or collapsed bounds: %j', (bounds) => {
        const context = setup()
        context.bounds(bounds)
        context.frame()
        expect(context.send).not.toHaveBeenCalled()
        context.bounds({ left: 0, top: 0, right: 200, bottom: 100 })
        context.frame()
        expect(context.send).toHaveBeenCalledTimes(1)
    })

    it('reports a new location and a resumed map immediately despite the previous throttle', () => {
        const context = setup()
        context.frame()
        context.time(1)
        context.location('map-2-3')
        context.frame()
        expect(context.send).toHaveBeenCalledTimes(2)
        expect(context.send).toHaveBeenLastCalledWith(
            expect.objectContaining({ locationId: 'map-2-3' })
        )
        context.viewport.reset()
        context.frame()
        expect(context.send).toHaveBeenCalledTimes(3)
    })

    it('detaches when stopped and attaches only one observer when restarted', () => {
        const context = setup()
        context.frame()
        context.viewport.stop()
        expect(context.off).toHaveBeenCalledWith('postupdate', expect.any(Function))
        context.time(100)
        context.bounds({ left: 100, top: 0, right: 300, bottom: 100 })
        context.frame()
        expect(context.send).toHaveBeenCalledTimes(1)
        context.viewport.start(context.engine)
        context.frame()
        expect(context.send).toHaveBeenCalledTimes(2)
        expect(context.on).toHaveBeenCalledTimes(2)
    })
})
