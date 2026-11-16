import type { Camera, Engine } from 'excalibur'
import { describe, expect, it, vi } from 'vitest'

import { clampMapCameraFocus, mapCameraBounds, mapCameraStrategy } from './mapCamera'

vi.mock('excalibur', () => ({ vec: (x: number, y: number) => ({ x, y }) }))

const map = Object.freeze({ worldWidth: 1536, worldHeight: 1280, tileWidth: 16, tileHeight: 16 })

describe('map camera margins', () => {
    it('uses six authored tiles on each axis without changing map geometry', () => {
        expect(mapCameraBounds(map)).toEqual({ left: -96, top: -96, right: 1632, bottom: 1376 })
        expect(mapCameraBounds({ ...map, tileWidth: 12, tileHeight: 20 })).toEqual({
            left: -72,
            top: -120,
            right: 1608,
            bottom: 1400,
        })
        expect(map.worldWidth).toBe(1536)
        expect(map.worldHeight).toBe(1280)
    })

    it('reveals the margin at every edge and follows freely in the map interior', () => {
        const bounds = mapCameraBounds(map)
        const viewport = { x: 400, y: 300 }
        expect(clampMapCameraFocus(bounds, { x: 16, y: 16 }, viewport)).toEqual({ x: 104, y: 54 })
        expect(clampMapCameraFocus(bounds, { x: 1520, y: 1264 }, viewport)).toEqual({
            x: 1432,
            y: 1226,
        })
        expect(clampMapCameraFocus(bounds, { x: 700, y: 500 }, viewport)).toEqual({
            x: 700,
            y: 500,
        })
    })

    it('centers only oversized viewport axes instead of alternating between inverted limits', () => {
        const bounds = mapCameraBounds(map)
        expect(clampMapCameraFocus(bounds, { x: 16, y: 16 }, { x: 2000, y: 300 })).toEqual({
            x: 768,
            y: 54,
        })
        expect(clampMapCameraFocus(bounds, { x: 1520, y: 1264 }, { x: 400, y: 2000 })).toEqual({
            x: 1432,
            y: 640,
        })
        expect(clampMapCameraFocus(bounds, { x: 0, y: 0 }, { x: 1728, y: 1472 })).toEqual({
            x: 768,
            y: 640,
        })
    })

    it('reads the current world-space viewport after resize rather than storing its initial size', () => {
        const strategy = mapCameraStrategy(map)
        const camera = { getFocus: () => ({ x: 16, y: 16 }) } as unknown as Camera
        const engine = { drawWidth: 400, drawHeight: 300 }
        expect(strategy.action(strategy.target, camera, engine as Engine, 16)).toEqual({
            x: 104,
            y: 54,
        })
        engine.drawWidth = 2000
        engine.drawHeight = 2000
        expect(strategy.action(strategy.target, camera, engine as Engine, 16)).toEqual({
            x: 768,
            y: 640,
        })
    })
})
