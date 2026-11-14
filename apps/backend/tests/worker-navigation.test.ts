import { CENTER_LOCATION_ID, FARM_PLOTS } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { advanceCharacter } from '../src/game/movement'
import { loadNavigationService } from '../src/game/navigation'
import type { GameRoom } from '../src/game/room'
import { approach, walkableNear } from '../src/game/workerNavigation'
import { WorldLocations } from '../src/game/worldLocations'

beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
})
afterEach(() => {
    vi.unstubAllGlobals()
})

describe('workers cross the authored city edges through shared movement', () => {
    it.each(['map-1-2', 'map-3-2', 'map-2-1', 'map-2-3'])(
        'walks from the city to a farm in %s without teleporting',
        (locationId) => {
            const navigation = loadNavigationService(CENTER_LOCATION_ID)
            const world = new WorldLocations(navigation)
            const actor = new GameCharacter({
                id: 'navigation-worker',
                nickname: 'Worker',
                archetype: 'human',
                controllerKind: 'scripted',
                faction: 'peaceful',
                spawnPosition: walkableNear(
                    navigation,
                    navigation.tileToWorld({ x: 35, y: 66 })
                ),
            })
            const room = {
                navigationFor: (character: GameCharacter) =>
                    world.get(character.locationId).navigation,
            } as unknown as GameRoom
            const target = FARM_PLOTS.find(
                (plot) => plot.locationId === locationId
            )?.position
            if (target === undefined) {
                throw new Error('Missing authored farm')
            }
            let reached = false
            for (let step = 0; step < 1200; step += 1) {
                if (
                    step % 5 === 0 &&
                    approach(actor, room, locationId, target)
                ) {
                    reached = true
                    break
                }
                const input = actor.getMoveInput()
                const next = actor.nextPathPoint()
                const intent =
                    input.x !== 0 || input.y !== 0 || next === undefined
                        ? input
                        : {
                              x: next.x - actor.position.x,
                              y: next.y - actor.position.y,
                          }
                advanceCharacter({
                    character: actor,
                    deltaMs: 100,
                    now: step * 100,
                    navigation: room.navigationFor(actor),
                })
                world.travel(actor, intent)
            }
            expect(reached).toBe(true)
            expect(actor.locationId).toBe(locationId)
            expect(
                Math.hypot(
                    actor.position.x - target.x,
                    actor.position.y - target.y
                )
            ).toBeLessThanOrEqual(36)
            expect(
                room
                    .navigationFor(actor)
                    .isSolidTile(
                        room.navigationFor(actor).worldToTile(actor.position)
                    )
            ).toBe(false)
        }
    )
})
