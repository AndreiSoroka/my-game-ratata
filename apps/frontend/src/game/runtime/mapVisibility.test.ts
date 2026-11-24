import type { AdventureResourceNode, WorldObjectSnapshot } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import {
    interactionHasLineOfSight,
    mapHasLineOfSight,
    type MapVisibility,
    updateObstacleVisibility,
} from './mapVisibility'

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

describe('door obstacle reconciliation', () => {
    it('applies closed thresholds to motion and vision without overwriting resource or wall collision', () => {
        const map = arena()
        map.solid[1] = true
        map.resourceBase = map.solid.slice()
        const tree: AdventureResourceNode = {
            id: 'tree',
            source: 'tree',
            phase: 'ready',
            kind: 'wood',
            remaining: 8,
            locationId: 'map-2-2',
            position: { x: 40, y: 40 },
            collisionBounds: { x: 32, y: 32, width: 16, height: 16 },
        }
        const door: WorldObjectSnapshot = {
            id: 'door',
            kind: 'door',
            name: 'Дверь',
            position: center,
            bounds: footprint,
            depleted: false,
            door: { state: 'closed' },
        }
        const crossesDoor = () => mapHasLineOfSight(map, { x: 72, y: 88 }, { x: 72, y: 56 })
        updateObstacleVisibility(map, [tree], undefined, [door])
        expect(crossesDoor()).toBe(false)
        updateObstacleVisibility(map, [tree], undefined, [{ ...door, door: { state: 'open' } }])
        expect(crossesDoor()).toBe(true)
        expect(map.solid[1]).toBe(true)
        expect(map.solid[2 * map.width + 2]).toBe(true)
        updateObstacleVisibility(map, [], undefined, [door])
        expect(crossesDoor()).toBe(false)
        expect(map.solid[2 * map.width + 2]).toBe(false)
    })
})

describe('resource obstacle reconciliation', () => {
    it('keeps known offscreen obstacles while updating depletion and absence inside a partial view', () => {
        const map = arena()
        map.solid[1] = true
        map.resourceBase = map.solid.slice()
        const node: AdventureResourceNode = {
            id: 'tree',
            source: 'tree',
            phase: 'ready',
            kind: 'wood',
            remaining: 8,
            locationId: 'map-2-2',
            position: center,
            collisionBounds: { x: 48, y: 48, width: 48, height: 32 },
        }
        const away = { left: 128, top: 128, right: 192, bottom: 192 }
        const nearby = { left: 32, top: 32, right: 112, bottom: 112 }
        updateObstacleVisibility(map, [node])
        updateObstacleVisibility(map, [], away)
        expect(map.solid[3 * 12 + 3]).toBe(true)
        expect(map.solid[1]).toBe(true)
        updateObstacleVisibility(
            map,
            [{ ...node, phase: 'stump', collisionBounds: footprint }],
            nearby
        )
        expect(map.solid[3 * 12 + 3]).toBe(false)
        expect(map.solid[4 * 12 + 4]).toBe(true)
        updateObstacleVisibility(map, [], away)
        expect(map.solid[4 * 12 + 4]).toBe(true)
        updateObstacleVisibility(map, [], nearby)
        expect(map.solid[4 * 12 + 4]).toBe(false)
        expect(map.solid[1]).toBe(true)
        updateObstacleVisibility(map, [node], nearby)
        expect(map.solid[3 * 12 + 3]).toBe(true)
        const freshMap = arena()
        updateObstacleVisibility(freshMap, [], away)
        expect(freshMap.solid.some(Boolean)).toBe(false)
    })

    it('updates changed collision bounds even while a resource stays in the same phase', () => {
        const map = arena()
        const node: AdventureResourceNode = {
            id: 'tree',
            source: 'tree',
            phase: 'ready',
            kind: 'wood',
            remaining: 8,
            locationId: 'map-2-2',
            position: center,
            collisionBounds: footprint,
        }
        updateObstacleVisibility(map, [node])
        updateObstacleVisibility(map, [{ ...node, collisionBounds: { ...footprint, x: 96 } }])
        expect(map.solid[4 * 12 + 4]).toBe(false)
        expect(map.solid[4 * 12 + 6]).toBe(true)
    })

    it('shrinks a tree to a stump, restores growth and never erases an unrelated wall', () => {
        const map = arena()
        map.solid[1] = true
        map.resourceBase = map.solid.slice()
        const node: AdventureResourceNode = {
            id: 'tree',
            source: 'tree',
            phase: 'ready',
            kind: 'wood',
            remaining: 8,
            locationId: 'map-2-2',
            position: { x: 72, y: 72 },
            collisionBounds: { x: 48, y: 48, width: 48, height: 32 },
        }
        updateObstacleVisibility(map, [node])
        expect(map.solid[3 * 12 + 3]).toBe(true)
        node.phase = 'stump'
        node.collisionBounds = { x: 64, y: 64, width: 16, height: 16 }
        updateObstacleVisibility(map, [node])
        expect(map.solid[3 * 12 + 3]).toBe(false)
        expect(map.solid[4 * 12 + 4]).toBe(true)
        expect(map.solid[1]).toBe(true)
        node.phase = 'ready'
        node.collisionBounds = { x: 48, y: 48, width: 48, height: 32 }
        updateObstacleVisibility(map, [node])
        expect(map.solid[3 * 12 + 3]).toBe(true)
        updateObstacleVisibility(map, [])
        expect(map.solid[3 * 12 + 3]).toBe(false)
        expect(map.solid[1]).toBe(true)
    })
})
