import { describe, expect, it } from 'vitest'

import { dungeonRayDistance } from './dungeonShadow'
import type { MapVisibility } from './mapVisibility'

const origin = { x: 24, y: 24 }
const diagonal = { x: Math.SQRT1_2, y: Math.SQRT1_2 }

function mapWithWall(column: number, row: number): MapVisibility {
    return {
        width: 5,
        height: 4,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array.from({ length: 20 }, (_, index) => index === row * 5 + column),
    }
}

describe('dungeon light rays', () => {
    it('stops at the wall face and preserves the requested radius inside clear space', () => {
        const map = mapWithWall(3, 1)
        expect(dungeonRayDistance(map, origin, { x: 1, y: 0 }, 64)).toBe(24)
        expect(dungeonRayDistance(map, origin, { x: 1, y: 0 }, 20)).toBe(20)
        expect(dungeonRayDistance(map, origin, { x: 0, y: -1 }, 64)).toBe(24)
    })

    it('does not cast through a blocked corner or start inside an opaque tile', () => {
        const map = mapWithWall(2, 1)
        expect(dungeonRayDistance(map, origin, diagonal, 64)).toBeCloseTo(Math.hypot(8, 8))
        expect(dungeonRayDistance(map, { x: 40, y: 24 }, diagonal, 64)).toBe(0)
    })
})
