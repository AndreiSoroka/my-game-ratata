import { describe, expect, it } from 'vitest'

import { interactionHasLineOfSight, mapHasLineOfSight, type MapVisibility } from './mapVisibility'

function arena(): MapVisibility {
    return {
        width: 12,
        height: 12,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array.from({ length: 144 }, () => false),
    }
}
const footprint = { x: 64, y: 64, width: 16, height: 16 }
const center = { x: 72, y: 72 }

describe('interaction visibility uses reachable geometry', () => {
    it('checks point targets against their actual action range and intervening walls', () => {
        const map = arena()
        const from = { x: 40, y: 72 }
        expect(interactionHasLineOfSight(map, from, { x: 64, y: 72 }, undefined, 24)).toBe(true)
        expect(interactionHasLineOfSight(map, from, { x: 64.1, y: 72 }, undefined, 24)).toBe(false)
        expect(interactionHasLineOfSight(map, from, { x: 104, y: 72 }, undefined, 64)).toBe(true)
        map.solid[4 * map.width + 3] = true
        expect(interactionHasLineOfSight(map, from, center)).toBe(false)
    })
    it('reaches the exterior of a solid chest or barrel, while rejecting a separate wall before it', () => {
        const map = arena()
        const from = { x: 40, y: 72 }
        map.solid[4 * map.width + 4] = true
        expect(mapHasLineOfSight(map, from, center)).toBe(false)
        expect(interactionHasLineOfSight(map, from, center, footprint, 28)).toBe(true)
        expect(interactionHasLineOfSight(map, from, center, footprint, 22)).toBe(false)
        map.solid[4 * map.width + 3] = true
        expect(interactionHasLineOfSight(map, from, center, footprint, 28)).toBe(false)
    })
    it('uses the accessible shore of a large solid water area instead of its blocked center', () => {
        const map = arena()
        const pond = { x: 64, y: 32, width: 96, height: 96 }
        for (let y = 2; y < 8; y++) for (let x = 4; x < 10; x++) map.solid[y * map.width + x] = true
        const middle = { x: 112, y: 80 }
        const from = { x: 40, y: 80 }
        expect(mapHasLineOfSight(map, from, middle)).toBe(false)
        expect(interactionHasLineOfSight(map, from, middle, pond, 48)).toBe(true)
        expect(interactionHasLineOfSight(map, { x: 14, y: 80 }, middle, pond, 48)).toBe(false)
    })
    it('permits overlap with a walkable sign only while an exterior edge remains accessible', () => {
        const map = arena()
        expect(interactionHasLineOfSight(map, center, center, footprint)).toBe(true)
        for (const [x, y] of [
            [4, 3],
            [3, 4],
            [5, 4],
            [4, 5],
        ] as const)
            map.solid[y * map.width + x] = true
        expect(interactionHasLineOfSight(map, center, center, footprint)).toBe(false)
        const solidOrigin = arena()
        solidOrigin.solid[4 * map.width + 4] = true
        expect(interactionHasLineOfSight(solidOrigin, center, center, footprint)).toBe(false)
    })
    it('does not consider origins or targets outside the loaded map visible', () => {
        const map = arena()
        expect(interactionHasLineOfSight(map, { x: -1, y: 72 }, { x: 8, y: 72 })).toBe(false)
        expect(interactionHasLineOfSight(map, { x: 8, y: 72 }, { x: -1, y: 72 })).toBe(false)
    })
})
