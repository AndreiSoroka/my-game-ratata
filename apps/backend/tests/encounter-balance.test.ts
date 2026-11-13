import { WORLD_LOCATION_DEFINITIONS } from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import {
    attemptAttack,
    isTargetInAttackRange,
    resolvePendingAttackHit,
} from '../src/game/combat'
import type { CharacterController } from '../src/game/controllers'
import { createItemInstance } from '../src/game/inventory'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import { findVisibleTarget } from '../src/game/queries'
import type { GameRoom } from '../src/game/room'
import { createLocationEnemies } from '../src/game/worldSpawns'

afterEach(() => vi.restoreAllMocks())

describe('group-oriented wilderness challenge', () => {
    it('defeats a lone newcomer, while four prepared allies can beat the same outskirts pack using ordinary shared combat', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5)
        const unprepared = encounter(1, false)
        const armedSolo = encounter(1, true)
        const party = encounter(4, true)
        for (const scenario of [unprepared, armedSolo, party]) {
            simulate(scenario)
        }
        expect(unprepared.players.every((player) => !player.alive)).toBe(true)
        expect(armedSolo.players.every((player) => !player.alive)).toBe(true)
        expect(armedSolo.monsters.some((monster) => monster.alive)).toBe(true)
        expect(
            party.monsters.every((monster) => !monster.alive),
            JSON.stringify({
                players: party.players.map((player) => ({
                    hp: player.hp,
                    alive: player.alive,
                    position: player.position,
                })),
                monsters: party.monsters.map((monster) => ({
                    hp: monster.hp,
                    alive: monster.alive,
                    position: monster.position,
                })),
            })
        ).toBe(true)
        expect(party.players.some((player) => player.alive)).toBe(true)
        expect(party.damageEvents).toBeGreaterThan(0)
        for (const player of [...armedSolo.players, ...party.players]) {
            expect(player.maxHp).toBe(30)
            expect(player.config.moveSpeed).toBe(90)
            expect(player.config.resources.maxEnergy).toBe(150)
        }
    })
})

function encounter(count: number, equipped: boolean) {
    const location = WORLD_LOCATION_DEFINITIONS.find(
        (candidate) => candidate.id === 'map-3-2'
    )
    if (location === undefined) {
        throw new Error('Missing outskirts')
    }
    const navigation = new NavigationService({
        id: location.id,
        width: 96,
        height: 80,
        tileWidth: 16,
        tileHeight: 16,
        solid: new Array<boolean>(96 * 80).fill(false),
        solidLayerNames: [],
    })
    const spawned = createLocationEnemies(navigation, location)
    const players = Array.from({ length: count }, (_, index) => {
        const player = new GameCharacter({
            archetype: 'human',
            controllerKind: 'network_player',
            faction: 'peaceful',
            locationId: location.id,
            id: `hero-${String(index)}`,
            nickname: 'Hero',
            spawnPosition: { x: 880, y: 568 + index * 16 },
        })
        if (equipped) {
            player.equipment.weapon = createItemInstance('simple_sword')
        }
        return player
    })
    const monsters = spawned.map(({ character }) => character)
    const characters = [...players, ...monsters]
    const controllers = new Map(
        spawned.map(({ character, controller }) => [character.id, controller])
    )
    for (const player of players) {
        controllers.set(player.id, playerPursuitController())
    }
    const result = {
        players,
        monsters,
        characters,
        controllers,
        navigation,
        damageEvents: 0,
    }
    return result
}

function simulate(scenario: ReturnType<typeof encounter>): void {
    const { characters, controllers, navigation } = scenario
    const context = (actor: GameCharacter, now: number) => ({
        actor,
        now,
        targets: characters,
        tileSize: 16,
        respawnDelayMsFor: () => 60_000,
    })
    const room = {
        getCharacter: (id: string) =>
            characters.find((character) => character.id === id),
        findVisibleTarget: (actor: GameCharacter, radius: number) =>
            findVisibleTarget(characters, navigation, actor, radius),
        navigationFor: () => navigation,
        publishEvents: () => undefined,
        requestAttack: (actor: GameCharacter, now: number) => {
            attemptAttack(context(actor, now))
        },
    } as unknown as GameRoom
    for (let now = 1_000; now < 21_000; now += 50) {
        for (const character of characters) {
            controllers.get(character.id)?.update(character, room, now)
        }
        for (const character of characters) {
            advanceCharacter({ character, navigation, now, deltaMs: 50 })
        }
        for (const character of characters) {
            scenario.damageEvents += resolvePendingAttackHit(
                context(character, now)
            ).filter((event) => event.kind === 'damage').length
        }
        if (
            scenario.players.every((player) => !player.alive) ||
            scenario.monsters.every((monster) => !monster.alive)
        ) {
            return
        }
    }
}

function playerPursuitController(): CharacterController {
    let lastPlanAt = 0
    return {
        update(actor, room, now) {
            if (!actor.alive || actor.tags.has('offline')) {
                return
            }
            // Human pursuit uses ordinary visibility and move_to; monster home leashes do not constrain it.
            const target = room.findVisibleTarget(actor, 112)
            if (target === undefined) {
                actor.clearPath()
                return
            }
            const navigation = room.navigationFor(actor)
            actor.updateFacing({
                x: target.position.x - actor.position.x,
                y: target.position.y - actor.position.y,
            })
            if (
                isTargetInAttackRange(actor, target, navigation.grid.tileWidth)
            ) {
                actor.clearPath()
                room.requestAttack(actor, now)
            } else if (!actor.hasPath() || now - lastPlanAt >= 500) {
                actor.setPath(
                    navigation.findPathWorld(actor.position, target.position)
                )
                lastPlanAt = now
            }
        },
    }
}
