import {
    CENTER_LOCATION_ID,
    distanceToInteractionAreas,
    interactionApproachPoints,
    interactionBoundary,
    type Vector2,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { NavigationService } from '../src/game/navigation'
import { practiceResourceMissing } from '../src/game/resourcePractice'
import type { WorldObjectDefinition } from '../src/game/worldObjectData'
import { readInteractionAreas } from '../src/game/worldObjectGeometry'

const areas = [
    { x: 64, y: 64, width: 16, height: 96 },
    { x: 80, y: 144, width: 80, height: 16 },
]
const bounds = { x: 64, y: 64, width: 96, height: 96 }
function fixture(position: Vector2) {
    const clock = { now: 1000 }
    const pond: WorldObjectDefinition = {
        id: 'one-pond',
        kind: 'water',
        name: 'Пруд',
        text: 'Берег',
        locationId: CENTER_LOCATION_ID,
        bounds,
        interactionAreas: areas,
    }
    const navigation = new NavigationService({
        id: 'pond',
        width: 16,
        height: 16,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: ['solid'],
        solid: Array<boolean>(256).fill(false),
    })
    for (const area of areas) {
        for (let y = area.y / 16; y < (area.y + area.height) / 16; y++) {
            for (let x = area.x / 16; x < (area.x + area.width) / 16; x++) {
                navigation.grid.solid[y * 16 + x] = true
            }
        }
    }
    const actor = new GameCharacter({
        id: 'hero',
        nickname: 'Первый',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: position,
    })
    actor.energy = 20
    const service = new AdventureService({
        now: () => clock.now,
        worldObjects: [pond],
    })
    const drink = () =>
        service.handle(
            actor,
            { type: 'world_interact', objectId: pond.id },
            [],
            navigation
        )
    return { clock, actor, service, drink, navigation }
}

describe('exact pond reach', () => {
    it('does not remove Angelic excess energy or create recovery credit when drinking', () => {
        const { actor, drink, clock } = fixture({ x: 40, y: 88 })
        actor.energy = actor.config.resources.maxEnergy * 1.5
        const before = actor.energy
        expect(drink()).toMatchObject([{ kind: 'water_drink' }])
        expect(actor.energy).toBe(before)
        expect(practiceResourceMissing(actor, 'energy')).toBe(0)
        clock.now += 5000
        actor.energy -= actor.config.resources.maxEnergy * 0.6
        expect(drink()).toMatchObject([{ kind: 'water_drink' }])
        expect(actor.energy).toBe(actor.config.resources.maxEnergy)
        expect(practiceResourceMissing(actor, 'energy')).toBe(0)
    })
    it.each([
        { x: 40, y: 88 },
        { x: 184, y: 152 },
        { x: 120, y: 184 },
        { x: 104, y: 104 },
    ])(
        'drinks from the same object at shore $x/$y, including its concave bay',
        (position) => {
            const { actor, drink } = fixture(position)
            expect(drink()).toMatchObject([{ kind: 'water_drink' }])
            expect(actor.energy).toBe(35)
        }
    )
    it('rejects a dry envelope corner and an intervening wall', () => {
        const { actor, drink, navigation } = fixture({ x: 152, y: 72 })
        expect(distanceToInteractionAreas(actor.position, areas)).toBe(72)
        expect(drink()).toEqual([])
        actor.position = { x: 40, y: 88 }
        for (let y = 0; y < 16; y++) {
            navigation.grid.solid[y * 16 + 3] = true
        }
        expect(drink()).toEqual([])
        expect(actor.energy).toBe(20)
    })
    it('keeps one actor cooldown while changing shore and returns detached footprint snapshots', () => {
        const { actor, drink, service, clock } = fixture({ x: 40, y: 88 })
        drink()
        actor.position = { x: 184, y: 152 }
        expect(drink()).toEqual([])
        clock.now += 5000
        expect(drink()).toHaveLength(1)
        const snapshot = service.snapshot(actor.id, actor.locationId, actor)
        const area = snapshot.worldObjects?.[0]?.interactionAreas?.[0]
        if (area === undefined) {
            throw new Error('Missing compound geometry')
        }
        area.x = -100
        expect(
            service.snapshot(actor.id, actor.locationId, actor)
                .worldObjects?.[0]?.interactionAreas?.[0]?.x
        ).toBe(64)
    })
})

describe('compound geometry authoring', () => {
    it('removes internal seams without filling the dry envelope corner', () => {
        const edges = interactionBoundary(areas)
        expect(
            edges.reduce(
                (sum, edge) =>
                    sum +
                    Math.hypot(
                        edge.to.x - edge.from.x,
                        edge.to.y - edge.from.y
                    ),
                0
            )
        ).toBe(384)
        expect(edges).not.toContainEqual({
            from: { x: 80, y: 144 },
            to: { x: 80, y: 160 },
            normal: { x: 1, y: 0 },
        })
        expect(interactionApproachPoints({ x: 104, y: 104 }, areas)[0]).toEqual(
            { x: 81, y: 104 }
        )
        expect(
            readInteractionAreas(JSON.stringify(areas), bounds, 'water')
        ).toEqual(areas)
    })
    it.each([
        null,
        '[]',
        '[{}]',
        '[{"x":64,"y":64,"width":0,"height":16}]',
        '[{"x":0,"y":64,"width":16,"height":16}]',
        '[{"x":64,"y":64,"width":144,"height":144}]',
    ])('rejects malformed or excessive geometry %s', (value) => {
        expect(() => readInteractionAreas(value, bounds, 'water')).toThrow()
    })
    it('limits compound footprints to ponds and at most 64 water tiles', () => {
        expect(() =>
            readInteractionAreas(JSON.stringify(areas), bounds, 'barrel')
        ).toThrow()
        const large = { x: 0, y: 0, width: 144, height: 128 }
        expect(() =>
            readInteractionAreas(JSON.stringify([large]), large, 'water')
        ).toThrow()
        expect(readInteractionAreas(undefined, bounds, 'water')).toBeUndefined()
    })
})
