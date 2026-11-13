import type { CharacterSnapshot, WorldObjectSnapshot } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { mapHasLineOfSight, type MapVisibility, readMapVisibility } from './mapVisibility'
import { nearestReadableSign } from './signReading'

function map(): MapVisibility {
    const result = {
        width: 12,
        height: 12,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array.from({ length: 144 }, () => false),
    }
    result.solid[6 * 12 + 6] = true
    return result
}
function sign(id = 'guild', x = 96): WorldObjectSnapshot {
    return {
        id,
        kind: 'sign',
        name: 'Гильдия искателей',
        position: { x: x + 8, y: 104 },
        bounds: { x, y: 96, width: 16, height: 16 },
        depleted: false,
    }
}
const reader = (x = 64): Pick<CharacterSnapshot, 'alive' | 'facing' | 'position' | 'tags'> => ({
    alive: true,
    facing: 'right',
    position: { x, y: 104 },
    tags: [],
})

describe('proximity-only sign reading', () => {
    it('reads the physical sign exterior at48px and hides it one step farther away', () => {
        const object = sign()
        expect(nearestReadableSign([object], reader(47), map(), () => true)).toBe(object)
        expect(nearestReadableSign([object], reader(46.9), map(), () => true)).toBeUndefined()
    })
    it('does not read through a wall or a roof hiding the sign', () => {
        const solid = map()
        solid.solid[6 * 12 + 5] = true
        expect(nearestReadableSign([sign()], reader(), solid, () => true)).toBeUndefined()
        expect(nearestReadableSign([sign()], reader(), map(), () => false)).toBeUndefined()
    })
    it('chooses one closest sign while keeping barrels and other object labels out of the reading hint', () => {
        const near = sign('near')
        const far = sign('far', 112)
        const barrel = { ...sign('barrel', 64), kind: 'barrel' as const }
        expect(nearestReadableSign([far, barrel, near], reader(), map(), () => true)).toBe(near)
    })
    it('clears the reading for death, disconnection, missing identity or unloaded map', () => {
        expect(
            nearestReadableSign([sign()], { ...reader(), alive: false }, map(), () => true)
        ).toBeUndefined()
        expect(
            nearestReadableSign([sign()], { ...reader(), tags: ['offline'] }, map(), () => true)
        ).toBeUndefined()
        expect(nearestReadableSign([sign()], undefined, map(), () => true)).toBeUndefined()
        expect(nearestReadableSign([sign()], reader(), undefined, () => true)).toBeUndefined()
    })
})

describe('sign reading follows the character gaze', () => {
    it.each([
        { facing: 'right' as const, position: { x: 64, y: 104 }, away: 'left' as const },
        { facing: 'left' as const, position: { x: 144, y: 104 }, away: 'right' as const },
        { facing: 'down' as const, position: { x: 104, y: 64 }, away: 'up' as const },
        { facing: 'up' as const, position: { x: 104, y: 144 }, away: 'down' as const },
    ])(
        'reads ahead facing $facing and immediately hides when turned away',
        ({ facing, position, away }) => {
            const object = sign()
            const player = { ...reader(), position, facing }
            expect(nearestReadableSign([object], player, map(), () => true)).toBe(object)
            player.facing = away
            expect(nearestReadableSign([object], player, map(), () => true)).toBeUndefined()
        }
    )
    it('includes a diagonal ahead with a pixel of tolerance but excludes sideways and rear signs', () => {
        const object = sign()
        for (const y of [72, 71.5]) {
            const player = { ...reader(72), position: { x: 72, y } }
            expect(nearestReadableSign([object], player, map(), () => true)).toBe(object)
        }
        for (const position of [
            { x: 72, y: 70 },
            { x: 104, y: 64 },
            { x: 120, y: 64 },
        ]) {
            const player = { ...reader(), position }
            expect(nearestReadableSign([object], player, map(), () => true)).toBeUndefined()
        }
    })
    it('reads from the sign footprint in every direction, including its edge and tiny position jitter', () => {
        const clearMap = map()
        clearMap.solid.fill(false)
        for (const facing of ['up', 'down', 'left', 'right'] as const) {
            for (const position of [
                { x: 104, y: 104 },
                { x: 104.5, y: 103.5 },
                { x: 96, y: 96 },
                { x: 112, y: 112 },
                { x: 104, y: 116 },
                { x: 116, y: 104 },
            ]) {
                const player = { ...reader(), facing, position }
                expect(nearestReadableSign([sign()], player, clearMap, () => true)).toBeDefined()
            }
        }
    })
    it('requires facing again just outside the overlap margin', () => {
        const object = sign()
        const player = { ...reader(), facing: 'down' as const, position: { x: 104, y: 116.1 } }
        expect(nearestReadableSign([object], player, map(), () => true)).toBeUndefined()
        expect(nearestReadableSign([object], { ...player, facing: 'up' }, map(), () => true)).toBe(
            object
        )
    })
    it('keeps life, roof and wall visibility checks when standing on the sign', () => {
        const object = sign()
        const player = { ...reader(), facing: 'down' as const, position: { x: 104, y: 116 } }
        expect(nearestReadableSign([object], player, map(), () => true)).toBe(object)
        expect(nearestReadableSign([object], player, map(), () => false)).toBeUndefined()
        expect(
            nearestReadableSign([object], { ...player, alive: false }, map(), () => true)
        ).toBeUndefined()
        expect(
            nearestReadableSign([object], { ...player, tags: ['offline'] }, map(), () => true)
        ).toBeUndefined()
        const enclosed = map()
        enclosed.solid.fill(true)
        expect(nearestReadableSign([object], player, enclosed, () => true)).toBeUndefined()
    })
    it('prefers the sign under the reader over another sign farther ahead', () => {
        const underfoot = sign('underfoot', 64)
        const ahead = sign('ahead')
        expect(nearestReadableSign([ahead, underfoot], reader(80), map(), () => true)).toBe(
            underfoot
        )
    })
    it('ignores a closer sign behind the reader and selects the visible sign ahead', () => {
        const ahead = sign('ahead')
        const behind = sign('behind', 56)
        expect(nearestReadableSign([behind, ahead], reader(80), map(), () => true)).toBe(ahead)
    })
})

describe('authored visibility grid', () => {
    it('reads explicit solids and legacy fences while leaving ordinary visual tiles transparent', () => {
        const visibility = readMapVisibility({
            width: 3,
            height: 1,
            tilewidth: 16,
            tileheight: 16,
            layers: [
                { type: 'tilelayer', name: 'Decoration', data: [12, 12, 12] },
                {
                    type: 'tilelayer',
                    name: 'Collision',
                    data: [1, 0, 0],
                    properties: [{ name: 'solid', value: true }],
                },
                { type: 'tilelayer', name: 'Fence', data: [0, 0, 5] },
                { type: 'objectgroup', name: 'City landmarks', data: [0, 1, 0] },
            ],
        })
        expect(visibility.solid).toEqual([true, false, true])
        expect(mapHasLineOfSight(visibility, { x: 20, y: 8 }, { x: 28, y: 8 })).toBe(true)
        expect(mapHasLineOfSight(visibility, { x: 24, y: 8 }, { x: 40, y: 8 })).toBe(false)
        expect(mapHasLineOfSight(visibility, { x: 24, y: 8 }, { x: 24, y: -8 })).toBe(false)
    })
})
