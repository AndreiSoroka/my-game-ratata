import type { WorldLocation } from '@my-game-ratata/contracts'
import { WORLD_LOCATION_DEFINITIONS } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { navigationGoal } from './agentNavigationTargets'
import { observeGame } from './agentObservation'
import { adventureFixture, characterFixture, worldFixture } from './characterFixture'
import type { RatataTestState } from './testInterface'

function location(id: string): WorldLocation {
    const definition = WORLD_LOCATION_DEFINITIONS.find((candidate) => candidate.id === id)!
    return {
        ...definition,
        columns: 5,
        rows: 5,
        regionName: 'Test region',
        map: {
            asset: { url: '/game/map/map1.json', revision: 'fixture' },
            id,
            width: 20,
            height: 12,
            tileWidth: 16,
            tileHeight: 32,
            worldWidth: 320,
            worldHeight: 384,
            solidLayerNames: [],
        },
    }
}

function fixture() {
    const player = characterFixture('player', { position: { x: 100, y: 100 }, facing: 'left' })
    const npc = characterFixture('mira', {
        controllerKind: 'scripted',
        position: { x: 124, y: 100 },
        inventory: [{ itemId: 'food', instanceId: 'private-npc-food' }],
        soul: {
            kind: 'spark',
            controlSource: 'script',
            canSpeak: true,
        },
    })
    const snapshot = {
        ...worldFixture([player, npc]),
        adventure: adventureFixture(),
        location: location('map-2-2'),
    }
    const state: RatataTestState = {
        connected: true,
        defeated: false,
        error: '',
        inventoryOpen: false,
        localPlayerId: player.id,
        location: snapshot.location,
        notice: '',
        player,
        snapshot,
        status: 'Connected',
    }
    return { player, npc, snapshot, state }
}

describe('AI observation', () => {
    it('approaches a harvestable trunk from outside its solid footprint', () => {
        const { state, snapshot } = fixture()
        const bounds = { x: 128, y: 96, width: 48, height: 32 }
        snapshot.adventure.resourceNodes = [
            {
                id: 'tree',
                kind: 'wood',
                source: 'tree',
                phase: 'ready',
                locationId: 'map-2-2',
                position: { x: 152, y: 120 },
                bounds,
                remaining: 8,
            },
        ]
        const goal = navigationGoal(
            state,
            { targetKey: 'resource:tree' },
            undefined,
            observeGame(state).targets
        )
        expect(goal?.candidates.length).toBe(4)
        for (const point of goal?.candidates ?? []) {
            expect(point.x < 128 || point.x > 176 || point.y < 96 || point.y > 128).toBe(true)
        }
    })
    it('returns a serializable detached view without other characters’ bags', () => {
        const { player, state } = fixture()
        player.inventory = [{ itemId: 'food', instanceId: 'owned-food' }]
        const observed = observeGame(state)
        expect(observed.player?.inventory[0]?.instanceId).toBe('owned-food')
        expect(JSON.stringify(observed)).not.toContain('private-npc-food')
        observed.player!.position.x = 999
        observed.adventure!.quest.status = 'completed'
        observed.targets[0]!.position.x = 999
        expect(player.position.x).toBe(100)
        expect(state.snapshot?.adventure?.quest.status).toBe('available')
        expect(state.snapshot?.characters[1]?.position.x).toBe(124)
    })

    it('keeps exact target commands independent of facing and nearby same-kind targets', () => {
        const { state, snapshot } = fixture()
        snapshot.items = [
            { id: 'one', itemId: 'food', position: { x: 110, y: 100 } },
            { id: 'two', itemId: 'food', position: { x: 120, y: 100 } },
            { id: 'far', itemId: 'food', position: { x: 220, y: 100 } },
        ]
        const observed = observeGame(state)
        expect(observed.targets.find((target) => target.key === 'character:mira')?.actions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ command: { type: 'interact', targetId: 'mira' } }),
            ])
        )
        for (const id of ['one', 'two'])
            expect(observed.targets.find((target) => target.key === `item:${id}`)?.actions).toEqual(
                [expect.objectContaining({ command: { type: 'pickup_item', worldItemId: id } })]
            )
        expect(observed.targets.find((target) => target.key === 'item:far')).toMatchObject({
            distance: 120,
            interactionRange: 24,
            actions: [],
        })
    })

    it('filters hidden targets and does not offer interactions through a wall', () => {
        const { state, snapshot } = fixture()
        snapshot.items = [{ id: 'hidden-item', itemId: 'food', position: { x: 108, y: 100 } }]
        const hidden = observeGame(state, {
            isCharacterVisible: () => false,
            isPositionVisible: (point) => point.x !== 108,
        })
        expect(hidden.targets).toEqual([])
        const blocked = observeGame(state, { isInteractionVisible: () => false })
        expect(blocked.targets.map((target) => target.key)).toContain('character:mira')
        expect(blocked.nearbyActions).toEqual([])
    })
})

it('observes one barrel container target without revealing its unopened inventory', () => {
    const { state, snapshot } = fixture()
    snapshot.chests = [
        {
            id: 'barrel',
            kind: 'barrel',
            title: 'Припасы',
            propId: 'barrel-prop',
            position: { x: 130, y: 100 },
            bounds: { x: 122, y: 92, width: 16, height: 16 },
            state: 'closed',
            itemCount: 2,
        },
    ]
    snapshot.adventure.worldObjects = [
        {
            id: 'barrel',
            kind: 'barrel',
            name: 'Припасы',
            position: { x: 130, y: 100 },
            bounds: { x: 122, y: 92, width: 16, height: 16 },
            depleted: false,
        },
    ]
    const observed = observeGame(state)
    expect(observed.targets.filter((target) => target.id === 'barrel')).toEqual([
        expect.objectContaining({
            key: 'chest:barrel',
            distance: 22,
            interactionRange: 28,
            details: { kind: 'barrel', propId: 'barrel-prop', state: 'closed', itemCount: 2 },
            actions: [
                expect.objectContaining({ command: { type: 'open_chest', chestId: 'barrel' } }),
            ],
        }),
    ])
    expect(observed.chest).toBeUndefined()
})
describe('AI interaction and travel observations', () => {
    it('uses footprint distance for water and chests, without disclosing unopened contents', () => {
        const { state, snapshot } = fixture()
        snapshot.adventure.worldObjects = [
            {
                id: 'pond',
                kind: 'water',
                name: 'Pond',
                position: { x: 250, y: 150 },
                bounds: { x: 120, y: 100, width: 260, height: 100 },
                depleted: false,
            },
        ]
        snapshot.chests = [
            { id: 'box', position: { x: 130, y: 100 }, state: 'closed', itemCount: 3 },
        ]
        const observed = observeGame(state)
        expect(observed.targets.find((target) => target.key === 'world:pond')).toMatchObject({
            distance: 20,
            actions: [
                expect.objectContaining({ command: { type: 'world_interact', objectId: 'pond' } }),
            ],
        })
        expect(observed.targets.find((target) => target.key === 'chest:box')).toMatchObject({
            distance: 22,
            interactionRange: 28,
            details: { itemCount: 3 },
        })
        expect(observed.chest).toBeUndefined()
    })

    it('offers the observed dialogue choices and retains quest facts', () => {
        const { state, snapshot } = fixture()
        snapshot.adventure.dialogue = {
            npcId: 'mira',
            npcName: 'Mira',
            title: 'Quest',
            text: 'Bring hearts',
            canTrade: true,
            choices: [{ id: 'accept_quest', label: 'Accept' }],
        }
        expect(observeGame(state)).toMatchObject({
            adventure: { quest: { status: 'available', goal: 3 } },
            dialogueChoices: [
                {
                    id: 'dialogue:accept_quest',
                    command: { type: 'dialogue_choice', choiceId: 'accept_quest' },
                },
            ],
        })
        state.connected = false
        expect(observeGame(state).nearbyActions).toEqual([])
        expect(observeGame(state).dialogueChoices).toEqual([])
        state.connected = true
        state.player!.alive = false
        expect(observeGame(state).nearbyActions).toEqual([])
        expect(observeGame(state).dialogueChoices).toEqual([])
    })

    it('derives neighbors from world data and crossing points from rectangular map dimensions', () => {
        const { state } = fixture()
        const observed = observeGame(state)
        expect(observed.exits).toEqual([
            expect.objectContaining({
                direction: 'north',
                locationId: 'map-2-1',
                axis: { x: 0, y: -1 },
                position: { x: 168, y: 16 },
            }),
            expect.objectContaining({
                direction: 'east',
                locationId: 'map-3-2',
                axis: { x: 1, y: 0 },
                position: { x: 312, y: 208 },
            }),
            expect.objectContaining({
                direction: 'south',
                locationId: 'map-2-3',
                axis: { x: 0, y: 1 },
                position: { x: 168, y: 368 },
            }),
            expect.objectContaining({
                direction: 'west',
                locationId: 'map-1-2',
                axis: { x: -1, y: 0 },
                position: { x: 8, y: 208 },
            }),
        ])
        state.location = location('map-0-0')
        expect(observeGame(state).exits.map((exit) => exit.direction)).toEqual(['east', 'south'])
    })

    it('handles the state before a player joins', () => {
        const { state } = fixture()
        state.connected = false
        state.player = undefined
        state.snapshot = undefined
        state.location = undefined
        expect(observeGame(state)).toMatchObject({
            connected: false,
            targets: [],
            exits: [],
            nearbyActions: [],
        })
    })
})

describe('public building discovery', () => {
    it('reveals authored entrances while keeping interior characters hidden outside', () => {
        const { state } = fixture()
        const observed = observeGame(state, {
            isCharacterVisible: () => false,
            isPositionVisible: () => false,
            getBuildings: () => [
                {
                    id: 'guild',
                    name: 'Гильдия искателей',
                    entry: { x: 648, y: 520 },
                    bounds: { x: 576, y: 384, width: 144, height: 144 },
                },
            ],
        })
        expect(observed.targets).toEqual([
            expect.objectContaining({
                key: 'building:guild',
                kind: 'building',
                name: 'Гильдия искателей',
                position: { x: 648, y: 520 },
                interactionRange: 0,
                actions: [],
            }),
        ])
        expect(observed.targets[0]).not.toHaveProperty('bounds')
        expect(JSON.stringify(observed.targets)).not.toContain('mira')
    })
})
