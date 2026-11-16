import {
    type CharacterSnapshot,
    type Vector2,
    WORLD_LOCATION_DEFINITIONS,
    type WorldObjectSnapshot,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { interactionHasLineOfSight, type MapVisibility } from '../runtime/mapVisibility'
import { nearbyInteractionTarget } from '../ui/nearbyInteractionActions'
import { goalDistance, navigationGoal } from './agentNavigationTargets'
import { observeGame } from './agentObservation'
import { adventureFixture, characterFixture, worldFixture } from './characterFixture'
import type { RatataTestState } from './testInterface'

const pond: WorldObjectSnapshot = {
    id: 'pond',
    kind: 'water',
    name: 'Пруд',
    depleted: false,
    bounds: { x: 64, y: 64, width: 96, height: 96 },
    position: { x: 112, y: 112 },
    interactionAreas: [
        { x: 64, y: 64, width: 16, height: 96 },
        { x: 80, y: 144, width: 80, height: 16 },
    ],
}
function fixture(position: Vector2, facing: CharacterSnapshot['facing'] = 'right') {
    const player = characterFixture('player', { position, facing })
    const snapshot = {
        ...worldFixture([player]),
        adventure: { ...adventureFixture(), worldObjects: [pond] },
    }
    const map: MapVisibility = {
        width: 16,
        height: 16,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(256).fill(false),
    }
    for (const area of pond.interactionAreas!) {
        for (let y = area.y / 16; y < (area.y + area.height) / 16; y++)
            for (let x = area.x / 16; x < (area.x + area.width) / 16; x++)
                map.solid[y * 16 + x] = true
    }
    const visible = (point: Vector2) => interactionHasLineOfSight(map, player.position, point)
    const state: RatataTestState = {
        connected: true,
        defeated: false,
        error: '',
        inventoryOpen: false,
        localPlayerId: player.id,
        notice: '',
        status: 'Connected',
        player,
        snapshot,
        location: {
            ...WORLD_LOCATION_DEFINITIONS[12]!,
            columns: 5,
            rows: 5,
            regionName: 'Test',
            map: { id: 'map-2-2', ...map, worldWidth: 256, worldHeight: 256, solidLayerNames: [] },
        },
    }
    return { player, snapshot, state, map, visible }
}

describe('one pond across UI and agent geometry', () => {
    it.each([
        [{ x: 40, y: 88 }, 'right'],
        [{ x: 184, y: 152 }, 'left'],
        [{ x: 120, y: 184 }, 'up'],
        [{ x: 104, y: 104 }, 'left'],
    ] as const)(
        'selects and observes the same water object from %j facing %s',
        (position, facing) => {
            const { player, snapshot, state, visible, map } = fixture(position, facing)
            const target = nearbyInteractionTarget(snapshot, player, snapshot.characters, visible)
            expect(target?.key).toBe('world:pond')
            expect(target?.interactionAreas).toEqual(pond.interactionAreas)
            expect(target?.actions[0]?.command).toEqual({
                type: 'world_interact',
                objectId: 'pond',
            })
            const observed = observeGame(state, {
                isPositionVisible: visible,
                isInteractionVisible: visible,
            })
            expect(observed.targets).toHaveLength(1)
            expect(observed.targets[0]?.actions).toHaveLength(1)
            expect(
                interactionHasLineOfSight(
                    map,
                    position,
                    pond.position,
                    pond.bounds,
                    48,
                    pond.interactionAreas
                )
            ).toBe(true)
        }
    )
    it('does not grant a nearby action or navigation arrival at an empty envelope corner', () => {
        const { player, snapshot, state, map } = fixture({ x: 152, y: 72 }, 'down')
        expect(nearbyInteractionTarget(snapshot, player, snapshot.characters)).toBeUndefined()
        const targets = observeGame(state).targets
        expect(targets[0]?.distance).toBe(72)
        const goal = navigationGoal(state, { targetKey: 'world:pond' }, undefined, targets)!
        expect(goalDistance(player.position, goal)).toBe(72)
        expect(goal.candidates).not.toContainEqual({ x: 168, y: 72 })
        for (const point of goal.candidates)
            expect(map.solid[Math.floor(point.y / 16) * 16 + Math.floor(point.x / 16)]).toBe(false)
        expect(
            interactionHasLineOfSight(
                map,
                player.position,
                pond.position,
                pond.bounds,
                48,
                pond.interactionAreas
            )
        ).toBe(false)
    })
    it('drops the exact pinned pond when a wall blocks every reachable shore', () => {
        const { player, snapshot, map, visible } = fixture({ x: 40, y: 88 })
        for (let y = 0; y < 16; y++) map.solid[y * 16 + 3] = true
        expect(
            nearbyInteractionTarget(snapshot, player, snapshot.characters, visible, 'world:pond')
        ).toBeUndefined()
    })
})
