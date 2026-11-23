import type {
    CharacterSnapshot,
    WorldObjectSnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { interactionHasLineOfSight, type MapVisibility } from '../runtime/mapVisibility'
import { adventureFixture, characterFixture, worldFixture } from '../testing/characterFixture'
import { nearbyInteractionTarget } from './nearbyInteractionActions'

const object = (
    id: string,
    x: number,
    y = 100,
    kind: WorldObjectSnapshot['kind'] = 'sign'
): WorldObjectSnapshot => ({
    id,
    kind,
    name: id,
    position: { x, y },
    bounds: { x: x - 8, y: y - 8, width: 16, height: 16 },
    depleted: false,
})
function setup() {
    const player = characterFixture('hero', { facing: 'right', position: { x: 100, y: 100 } })
    const snapshot = {
        ...worldFixture([player]),
        adventure: { ...adventureFixture(), worldObjects: [] as WorldObjectSnapshot[] },
    }
    return {
        player,
        snapshot,
        select: (
            state: WorldSnapshot = snapshot,
            people: CharacterSnapshot[] = state.characters,
            visible?: (point: { x: number; y: number }) => boolean,
            key?: string
        ) => nearbyInteractionTarget(state, player, people, visible, key),
    }
}
it('offers the exact local portal within reach and removes the action at expiry', () => {
    const { player, snapshot, select } = setup()
    const expiresAt = snapshot.serverTime + 60_000
    const state = {
        ...snapshot,
        portals: [
            {
                id: 'entrance',
                locationId: 'map-1-2',
                destinationLocationId: 'map-2-2',
                destinationName: 'Новогород',
                position: { x: 132, y: 100 },
                expiresAt,
            },
        ],
    }
    expect(select(state)?.actions[0]?.command).toEqual({
        type: 'use_portal',
        endpointId: 'entrance',
    })
    expect(select(state, [player], () => false)).toBeUndefined()
    expect(select({ ...state, serverTime: expiresAt })).toBeUndefined()
    player.abilities = {
        known: [],
        cooldowns: {},
        casting: null,
        barrier: null,
        rootedUntil: expiresAt,
    }
    expect(select(state)).toBeUndefined()
})

describe('one facing interaction target', () => {
    it('selects the sign ahead even when a sign of the same kind is closer behind', () => {
        const { player, snapshot, select } = setup()
        snapshot.adventure.worldObjects = [
            object('behind', 80),
            object('ahead', 132),
            object('side', 100, 124),
        ]
        expect(select()?.actions.map((a) => a.command)).toEqual([
            { type: 'world_interact', objectId: 'ahead' },
        ])
        player.facing = 'left'
        expect(select()?.key).toBe('world:behind')
        player.facing = 'up'
        expect(select()).toBeUndefined()
    })
    it('does not combine a character, resources, chest and sign into one menu', () => {
        const { snapshot, select } = setup()
        snapshot.adventure.worldObjects = [object('sign', 132)]
        snapshot.adventure.resourceNodes = [
            {
                id: 'herbs',
                kind: 'herbs',
                locationId: 'map-2-2',
                position: { x: 100, y: 124 },
                remaining: 3,
            },
        ]
        snapshot.chests = [
            { id: 'chest', position: { x: 76, y: 100 }, state: 'closed', itemCount: 1 },
        ]
        snapshot.characters.push(characterFixture('npc', { position: { x: 100, y: 80 } }))
        expect(select()?.key).toBe('world:sign')
        expect(select()?.actions).toHaveLength(1)
    })
    it('offers all actions for the chosen NPC and none belonging to another NPC', () => {
        const { snapshot, select } = setup()
        const person = (id: string, x: number) =>
            characterFixture(id, {
                position: { x, y: 100 },
                controllerKind: 'scripted',
                interactions: {
                    aiDialogue: true,
                    dialogueMode: 'active',
                    whisper: false,
                    exchange: false,
                    companionRequests: 'available',
                    companionCanFight: true,
                },
                soul: {
                    kind: 'spark',
                    controlSource: 'model',
                    canSpeak: true,
                },
            })
        snapshot.characters.push(person('behind', 80), person('ahead', 124))
        const target = select()!
        expect(target.key).toBe('character:ahead')
        expect(target.actions.map((a) => a.command.type)).toEqual([
            'interact',
            'companion_request',
            'companion_request',
            'steal',
            'follow',
        ])
        expect(
            target.actions.every((a) => 'targetId' in a.command && a.command.targetId === 'ahead')
        ).toBe(true)
    })
    it.each(['passive', 'scripted'] as const)(
        'allows addressing a %s NPC without offering companion orders',
        (dialogueMode) => {
            const { snapshot, select } = setup()
            const canSpeak = dialogueMode === 'passive'
            snapshot.characters.push(
                characterFixture('resident', {
                    position: { x: 124, y: 100 },
                    controllerKind: 'scripted',
                    soul: { kind: 'echo', controlSource: 'script', canSpeak },
                    interactions: {
                        dialogueMode,
                        aiDialogue: canSpeak,
                        whisper: false,
                        exchange: false,
                    },
                })
            )

            const commands = select()?.actions.map(({ command }) => command)
            expect(commands).toContainEqual({ type: 'interact', targetId: 'resident' })
            expect(commands?.some(({ type }) => type === 'companion_request')).toBe(false)
        }
    )
    it('pins an exact target, never substituting a newly closer neighbor', () => {
        const { snapshot, select } = setup()
        snapshot.adventure.worldObjects = [object('first', 132), object('other', 140)]
        const key = select()!.key
        snapshot.adventure.worldObjects[1]!.position.x = 120
        snapshot.adventure.worldObjects[1]!.bounds.x = 112
        expect(select()?.key).toBe('world:other')
        expect(select(snapshot, snapshot.characters, undefined, key)?.key).toBe(key)
        snapshot.adventure.worldObjects.shift()
        expect(select(snapshot, snapshot.characters, undefined, key)).toBeUndefined()
    })
    it('keeps a sign underfoot available in every direction, while distance and visibility still apply', () => {
        const { player, snapshot, select } = setup()
        snapshot.adventure.worldObjects = [object('underfoot', 100)]
        for (const facing of ['up', 'down', 'left', 'right'] as const) {
            player.facing = facing
            expect(select()?.key).toBe('world:underfoot')
        }
        expect(select(snapshot, snapshot.characters, () => false)).toBeUndefined()
        player.position.x = 170
        expect(select()).toBeUndefined()
        player.alive = false
        expect(select()).toBeUndefined()
    })
})

it('keeps companion requests in sight out to 64 pixels using the viewer’s action availability', () => {
    const { snapshot, select } = setup()
    const npc = characterFixture('resident', {
        position: { x: 164, y: 100 },
        controllerKind: 'scripted',
        soul: { kind: 'spark', controlSource: 'model', canSpeak: true },
        interactions: {
            aiDialogue: true,
            dialogueMode: 'active',
            whisper: true,
            exchange: true,
            companionRequests: 'available',
            companionCanFight: true,
        },
    })
    snapshot.characters.push(npc)
    const follow = { type: 'companion_request', request: 'follow', targetId: npc.id }
    const help = { type: 'companion_request', request: 'help', targetId: npc.id }
    expect(select()?.actions.map(({ command }) => command)).toEqual([follow, help])

    npc.interactions!.companionRequests = 'own'
    expect(select()?.actions.map(({ command }) => command)).toEqual([
        follow,
        help,
        { type: 'companion_request', request: 'guard', targetId: npc.id },
        { type: 'companion_request', request: 'dismiss', targetId: npc.id },
    ])
    expect(select(snapshot, snapshot.characters, () => false)).toBeUndefined()

    npc.interactions!.companionRequests = 'occupied'
    expect(select()?.actions).toMatchObject([
        { command: follow, disabled: true },
        { command: help, disabled: true },
    ])

    npc.interactions!.companionCanFight = false
    expect(select()?.actions).toMatchObject([{ command: follow, disabled: true }])

    npc.position.x = 165
    expect(select()).toBeUndefined()
})

describe('commands for the selected interaction target', () => {
    it('selects the exact loose item in front even if another is closer behind', () => {
        const { snapshot, select } = setup()
        snapshot.items = [
            { id: 'behind', itemId: 'food', position: { x: 90, y: 100 } },
            { id: 'front', itemId: 'food', position: { x: 120, y: 100 } },
        ]
        expect(select()?.actions.map((a) => a.command)).toEqual([
            { type: 'pickup_item', worldItemId: 'front' },
        ])
    })
    it('selects a single bed and uses different action identities for sow and harvest', () => {
        const { snapshot, select } = setup()
        snapshot.adventure.farmPlots = [
            {
                id: 'bed',
                locationId: 'map-2-2',
                crop: 'wheat',
                name: 'bed',
                position: { x: 124, y: 100 },
                phase: 'bare',
                readyAt: 0,
            },
        ]
        const sow = select()!.actions[0]!
        snapshot.adventure.farmPlots[0]!.phase = 'ripe'
        const harvest = select()!.actions[0]!
        expect(sow.id).not.toBe(harvest.id)
        expect(harvest.command).toEqual({ type: 'farm_action', plotId: 'bed', action: 'harvest' })
    })
    it('targets the nearby shore of large water, not an unreachable distant center', () => {
        const { snapshot, select } = setup()
        snapshot.adventure.worldObjects = [
            {
                ...object('pond', 220, 148, 'water'),
                bounds: { x: 120, y: 100, width: 200, height: 96 },
            },
        ]
        expect(select()?.actions[0]?.command).toEqual({ type: 'world_interact', objectId: 'pond' })
    })
    it('skips a closer target behind a wall rather than hiding an accessible target ahead', () => {
        const { player, snapshot } = setup()
        player.position = { x: 8, y: 40 }
        snapshot.adventure.worldObjects = [object('blocked', 40, 40), object('visible', 40, 64)]
        const map: MapVisibility = {
            width: 8,
            height: 8,
            tileWidth: 16,
            tileHeight: 16,
            solid: Array.from({ length: 64 }, () => false),
        }
        map.solid[2 * 8 + 1] = true
        const target = nearbyInteractionTarget(
            snapshot,
            player,
            snapshot.characters,
            (position, bounds, range) =>
                interactionHasLineOfSight(map, player.position, position, bounds, range)
        )
        expect(target?.key).toBe('world:visible')
    })
    it('does not add remote emergency guard calls to an unrelated target menu', () => {
        const { player, snapshot, select } = setup()
        player.theft!.accusations = [
            {
                thiefId: 'remote',
                thiefName: 'Thief',
                expiresAt: 200000,
                canCallGuards: true,
                reported: false,
            },
        ]
        snapshot.adventure.worldObjects = [object('sign', 132)]
        expect(select()?.actions).toHaveLength(1)
        expect(select()?.actions[0]?.command.type).toBe('world_interact')
    })
})
