import type { Vector2 } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { characterClearance } from '../src/game/characterSpacing'
import {
    advanceCompanionIntent,
    type CompanionRuntime,
} from '../src/game/companionMovement'
import { residentProfile } from '../src/game/companionProfiles'
import { grantRetaliation } from '../src/game/crimeRelations'
import { canYieldWhileIdle, idleSideStep } from '../src/game/idleNpcSpacing'
import { distance } from '../src/game/math'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import type { GameRoom } from '../src/game/room'
import { approachCharacter } from '../src/game/workerNavigation'
import { createEconomyWorkers } from '../src/game/workerSpawns'

const workshop = { x: 152, y: 88 }
const origin = { x: 88, y: 88 }

function arena() {
    return new NavigationService({
        cityAnchors: { 'service.workshop': workshop },
        id: 'standing-places',
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(400).fill(false),
    })
}

function character(
    id: string,
    spawnPosition: Vector2,
    controllerKind: 'scripted' | 'network_player' = 'scripted'
) {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        controllerKind,
        faction: 'peaceful',
        spawnPosition,
    })
}

function expectSeparate(characters: GameCharacter[]) {
    for (const [index, actor] of characters.entries()) {
        for (const other of characters.slice(index + 1)) {
            expect(
                distance(actor.position, other.position)
            ).toBeGreaterThanOrEqual(characterClearance)
        }
    }
}

it('starts the three workers around the occupied workshop anchor', () => {
    const workers = createEconomyWorkers(arena()).map(
        ({ character }) => character
    )
    expectSeparate([...workers, character('artisan', workshop)])
})

it('walks two workers to separate places in reach of the same merchant', () => {
    const navigation = arena()
    const merchant = character('merchant', workshop)
    const workers = [
        character('worker-a', origin),
        character('worker-b', origin),
    ]
    const characters = [...workers, merchant]
    const room = {
        charactersFor: () => characters,
        navigationFor: () => navigation,
    } as unknown as GameRoom
    for (let now = 0; now <= 3000; now += 50) {
        for (const actor of workers) {
            if (now % 500 === 0) {
                approachCharacter(actor, room, merchant)
            }
            advanceCharacter({
                character: actor,
                navigation,
                now,
                deltaMs: 50,
            })
        }
    }
    for (const actor of workers) {
        expect(approachCharacter(actor, room, merchant)).toBe(true)
        expect(actor.hasPath()).toBe(false)
    }
    expect(merchant.position).toEqual(workshop)
    expectSeparate(characters)
})

it('lets companions stand beside the same leader while staying within follow range', () => {
    const navigation = arena()
    const leader = character('leader', workshop, 'network_player')
    const companions = [
        character('companion-a', origin),
        character('companion-b', origin),
    ]
    const characters = [...companions, leader]
    const followers = companions.map((actor) => {
        const state: CompanionRuntime = {
            anchor: actor.spawnPosition,
            anchorLocation: actor.locationId,
            lastPlanAt: 0,
            lastReply: null,
            leaderId: leader.id,
            metActors: new Set(),
            order: 'follow',
            profile: { ...residentProfile, stationary: false },
        }
        return { actor, state }
    })
    const world = {
        charactersFor: () => characters,
        navigationFor: () => navigation,
        findVisibleTarget: () => undefined,
        getCharacter: (id: string) =>
            characters.find((actor) => actor.id === id),
        requestAttack: () => undefined,
    }
    for (let now = 0; now <= 3000; now += 50) {
        for (const { actor, state } of followers) {
            advanceCompanionIntent(actor, leader, state, world, now)
            advanceCharacter({
                character: actor,
                navigation,
                now,
                deltaMs: 50,
            })
        }
    }
    expect(leader.position).toEqual(workshop)
    for (const { actor, state } of followers) {
        expect(distance(actor.position, leader.position)).toBeLessThanOrEqual(
            28
        )
        state.lastPlanAt = 3000
        actor.setPath([{ ...actor.position, y: actor.position.y + 16 }])
        advanceCompanionIntent(actor, leader, state, world, 3050)
        expect(actor.hasPath()).toBe(false)
    }
    expectSeparate(characters)
})

it('resolves standing overlap through ordinary movement without replacing explicit paths', () => {
    const navigation = arena()
    navigation.grid.solid.fill(true)
    for (let y = 3; y < 18; y += 1) {
        navigation.grid.solid[y * 20 + 5] = false
    }
    const player = character('player', origin, 'network_player')
    const npc = character('npc_friendly_girl_1', origin)
    const yielding = new Set([npc.id])
    expect(canYieldWhileIdle(player, 0)).toBe(false)
    expect(canYieldWhileIdle(npc, 0)).toBe(true)
    const firstChoice = idleSideStep(
        npc,
        [npc, player],
        yielding,
        navigation,
        0
    )
    if (firstChoice === undefined) {
        throw new Error('Expected a free space in the corridor')
    }
    const traveler = character('traveler', { x: origin.x, y: 248 })
    traveler.setPath([firstChoice])
    expect(
        idleSideStep(npc, [npc, player, traveler], yielding, navigation, 0)
    ).toEqual({
        x: origin.x,
        y: 2 * origin.y - firstChoice.y,
    })
    for (let now = 0; now <= 500; now += 50) {
        const idleDestination = idleSideStep(
            npc,
            [npc, player],
            yielding,
            navigation,
            now
        )
        advanceCharacter({
            character: npc,
            navigation,
            now,
            deltaMs: 50,
            ...(idleDestination === undefined ? {} : { idleDestination }),
        })
    }
    expect(npc.position.x).toBe(origin.x)
    expect(npc.hasPath()).toBe(false)
    expect(player.position).toEqual(origin)
    expectSeparate([npc, player])

    const route = [{ x: origin.x, y: origin.y + 32 }]
    npc.setPath(route)
    expect(canYieldWhileIdle(npc, 550)).toBe(false)
    expect(npc.path).toBe(route)
})

it('holds position when overlapping characters have an active retaliation right', () => {
    const navigation = arena()
    const player = character('player', origin, 'network_player')
    const npc = character('npc', origin)
    const characters = [npc, player]
    const yielding = new Set([npc.id])
    expect(
        idleSideStep(npc, characters, yielding, navigation, 100)
    ).toBeDefined()
    grantRetaliation(npc, player, 200)
    expect(
        idleSideStep(npc, characters, yielding, navigation, 150)
    ).toBeUndefined()
    expect(
        idleSideStep(npc, characters, yielding, navigation, 250)
    ).toBeDefined()
    expect(canYieldWhileIdle(character('npc_merchant_1', workshop), 100)).toBe(
        false
    )
})
