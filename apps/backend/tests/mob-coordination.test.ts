import type { Vector2 } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { coordinatedTarget, reportedThreatPosition } from '../src/game/mobAggro'
import { NavigationService } from '../src/game/navigation'
import { findVisibleTarget } from '../src/game/queries'
import type { GameRoom } from '../src/game/room'

function actor(id: string, position: Vector2, hostile = true): GameCharacter {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: hostile ? 'skeleton' : 'human',
        controllerKind: hostile ? 'mob1' : 'network_player',
        faction: hostile ? 'monsters' : 'peaceful',
        locationId: 'map-3-2',
        spawnPosition: position,
    })
}
function setup() {
    const scout = actor('scout', { x: 200, y: 200 })
    const ally = actor('ally', { x: 176, y: 224 })
    const target = actor('target', { x: 300, y: 200 }, false)
    const characters = [scout, ally, target]
    const navigation = new NavigationService({
        id: 'open',
        width: 40,
        height: 40,
        tileWidth: 16,
        tileHeight: 16,
        solid: new Array<boolean>(1600).fill(false),
        solidLayerNames: [],
    })
    const room = {
        getCharacter: (id: string) =>
            characters.find((character) => character.id === id),
        findVisibleTarget: (observer: GameCharacter, radius: number) =>
            findVisibleTarget(
                characters.filter(
                    (character) =>
                        character.locationId === observer.locationId &&
                        !character.tags.has('offline')
                ),
                navigation,
                observer,
                radius
            ),
    } as unknown as GameRoom
    return { scout, ally, target, characters, navigation, room }
}

describe('bounded cooperative monster perception', () => {
    it('alerts nearby allies from real sight without relaying hearsay and lets the alert expire', () => {
        const { scout, ally, target, room } = setup()
        expect(room.findVisibleTarget(ally, 112)).toBeUndefined()
        expect(coordinatedTarget(ally, room, 5_000)).toBeUndefined()
        expect(coordinatedTarget(scout, room, 5_000)).toBe(target)
        expect(coordinatedTarget(ally, room, 5_000)).toBeUndefined()
        expect(reportedThreatPosition(ally, room, 5_000)).toEqual(
            target.position
        )
        expect(reportedThreatPosition(ally, room, 8_999)).toEqual(
            target.position
        )
        expect(reportedThreatPosition(ally, room, 9_000)).toBeUndefined()
    })

    it('shares a frozen last-known point, never a hidden moving target', () => {
        const { scout, ally, target, room } = setup()
        coordinatedTarget(scout, room, 5_000)
        const seen = { ...target.position }
        target.position.x = 600
        expect(coordinatedTarget(ally, room, 5_100)).toBeUndefined()
        expect(reportedThreatPosition(ally, room, 5_100)).toEqual(seen)
    })

    it('requires line of sight at the original witness', () => {
        const { scout, ally, room, navigation } = setup()
        navigation.grid.solid[12 * 40 + 15] = true
        expect(coordinatedTarget(scout, room, 5_000)).toBeUndefined()
        expect(coordinatedTarget(ally, room, 5_000)).toBeUndefined()
    })

    it.each(['offline', 'dead', 'other-location'] as const)(
        'discards an alert whose target becomes %s',
        (reason) => {
            const { scout, ally, target, room } = setup()
            coordinatedTarget(scout, room, 5_000)
            if (reason === 'offline') {
                target.tags.add('offline')
            }
            if (reason === 'dead') {
                target.applyDamage(target.hp, 5_010)
            }
            if (reason === 'other-location') {
                target.locationId = 'map-4-2'
            }
            expect(reportedThreatPosition(ally, room, 5_100)).toBeUndefined()
        }
    )

    it('limits hearing to faction, location and radius and rejects an offline observer', () => {
        const { scout, ally, target, characters, room } = setup()
        coordinatedTarget(scout, room, 5_000)
        const distant = actor('distant', { x: 432, y: 200 })
        characters.push(distant)
        expect(coordinatedTarget(distant, room, 5_000)).toBeUndefined()
        ally.locationId = 'map-4-2'
        expect(coordinatedTarget(ally, room, 5_000)).toBeUndefined()
        ally.locationId = scout.locationId
        ally.tags.add('offline')
        expect(coordinatedTarget(ally, room, 5_000)).toBeUndefined()
        const friendly = actor('friendly', { x: 464, y: 224 }, false)
        characters.push(friendly)
        expect(coordinatedTarget(friendly, room, 5_000)).not.toBe(target)
    })

    it('keeps a directly visible opponent beyond home while bounding indirect investigation', () => {
        const { scout, ally, target, room } = setup()
        scout.position.x = 530
        ally.position.x = 520
        target.position.x = 550
        expect(room.findVisibleTarget(scout, 112)).toBe(target)
        expect(coordinatedTarget(scout, room, 5_000)).toBe(target)
        expect(reportedThreatPosition(ally, room, 5_000)).toBeUndefined()
    })

    it('does not publish target changes more than once per second', () => {
        const { scout, ally, target, characters, room } = setup()
        coordinatedTarget(scout, room, 5_000)
        const nextTarget = actor('next', { x: 296, y: 188 }, false)
        characters.push(nextTarget)
        expect(coordinatedTarget(scout, room, 5_500)).toBe(nextTarget)
        expect(reportedThreatPosition(ally, room, 5_500)).toEqual(
            target.position
        )
        expect(coordinatedTarget(scout, room, 6_000)).toBe(nextTarget)
        expect(reportedThreatPosition(ally, room, 6_000)).toEqual(
            nextTarget.position
        )
    })
})
