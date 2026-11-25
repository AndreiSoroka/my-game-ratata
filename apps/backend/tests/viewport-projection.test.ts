import {
    type AdventureSnapshot,
    CENTER_LOCATION_ID,
    type SetViewportClientMessage,
    WORLD_LOCATION_DEFINITIONS,
    type WorldLocation,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { createCharacterSnapshot } from '../src/game/characterSnapshot'
import { projectViewport } from '../src/game/viewportProjection'

const playerId = 'viewer'
const viewport: SetViewportClientMessage = {
    type: 'set_viewport',
    locationId: CENTER_LOCATION_ID,
    bounds: { left: 100, top: 100, right: 200, bottom: 200 },
}

function character(id: string, x: number, y = 150) {
    return createCharacterSnapshot(
        new GameCharacter({
            id,
            nickname: id,
            locationId: CENTER_LOCATION_ID,
            archetype: 'human',
            controllerKind: 'network_player',
            spawnPosition: { x, y },
        }),
        10_000,
        false
    )
}

function location(): WorldLocation {
    const definition = WORLD_LOCATION_DEFINITIONS.find(
        (entry) => entry.id === CENTER_LOCATION_ID
    )
    if (definition === undefined) {
        throw new Error('Missing center location')
    }
    return {
        ...definition,
        columns: 5,
        rows: 5,
        regionName: 'Test region',
        map: {
            id: CENTER_LOCATION_ID,
            asset: { url: '/test.json', revision: 'test' },
            width: 100,
            height: 100,
            tileWidth: 16,
            tileHeight: 16,
            worldWidth: 1600,
            worldHeight: 1600,
            solidLayerNames: [],
        },
    }
}

function adventure(): AdventureSnapshot {
    return {
        dialogue: {
            npcId: 'outside',
            npcName: 'Quest giver',
            title: 'Conversation',
            text: 'Keep the active dialogue.',
            choices: [],
            canTrade: false,
        },
        gold: 17,
        materials: {
            herbs: 0,
            fiber: 0,
            scrap: 0,
            wood: 0,
            grain: 0,
            stone: 0,
            sapling: 0,
            brushwood: 0,
        },
        noticeId: 3,
        notice: 'A committed action result',
        quest: {
            id: 'quest',
            title: 'An active quest',
            description: 'Keep quest progress outside the screen.',
            goal: 3,
            kills: 1,
            rewardGold: 20,
            status: 'active',
        },
        farmPlots: [],
        resourceNodes: [],
        worldObjects: [],
        recipes: [],
        shop: [],
        trophies: 1,
        wardRestored: true,
    }
}

function fixture(): WorldSnapshot {
    const positions = [
        { id: 'inside', position: { x: 150, y: 150 } },
        { id: 'margin', position: { x: 210, y: 150 } },
        { id: 'outside', position: { x: 1000, y: 1000 } },
    ]
    return {
        serverEpoch: 'test-epoch',
        serverTime: 10_000,
        tick: 20,
        location: location(),
        characters: [
            character(playerId, 900, 900),
            ...positions.map(({ id, position }) =>
                character(id, position.x, position.y)
            ),
        ],
        items: positions.map((entry) => ({ ...entry, itemId: 'food' })),
        chests: positions.map((entry) => ({
            ...entry,
            state: 'closed',
            itemCount: 1,
        })),
        graves: positions.map((entry) => ({
            ...entry,
            buriedName: 'Мирослав',
            locationId: CENTER_LOCATION_ID,
            phase: 'active',
            material: 'stone',
            health: { kind: 'percent', percent: 80 },
        })),
        portals: positions.map((entry) => ({
            ...entry,
            locationId: CENTER_LOCATION_ID,
            destinationLocationId: 'map-3-2',
            destinationName: 'Eastern Gardens',
            expiresAt: 20_000,
        })),
        magicEffects: positions.map(({ id, position }) => ({
            id,
            abilityId: 'chains',
            center: position,
            radius: 4,
            expiresAt: 20_000,
        })),
        adventure: {
            ...adventure(),
            farmPlots: positions.map((entry) => ({
                ...entry,
                locationId: CENTER_LOCATION_ID,
                name: 'Wheat bed',
                crop: 'wheat',
                phase: 'bare',
                readyAt: 0,
            })),
            resourceNodes: positions.map((entry) => ({
                ...entry,
                locationId: CENTER_LOCATION_ID,
                kind: 'herbs',
                remaining: 2,
            })),
            worldObjects: positions.map((entry) => ({
                ...entry,
                kind: 'sign',
                name: 'A sign',
                depleted: false,
                bounds: {
                    x: entry.position.x - 4,
                    y: entry.position.y - 4,
                    width: 8,
                    height: 8,
                },
            })),
        },
    }
}

function ids(entries: Array<{ id: string }> | undefined) {
    return entries?.map((entry) => entry.id)
}

it('keeps compatibility without a hint and ignores a hint from the previous map', () => {
    const snapshot = fixture()
    expect(projectViewport(snapshot, undefined, playerId)).toEqual(snapshot)
    expect(
        projectViewport(
            snapshot,
            { ...viewport, locationId: 'map-3-2' },
            playerId
        )
    ).toEqual(snapshot)
    const withoutLocation = { ...snapshot }
    delete withoutLocation.location
    expect(projectViewport(withoutLocation, viewport, playerId)).toEqual(
        withoutLocation
    )
})

it('filters every spatial collection, adds a margin and always retains the acting identity', () => {
    const snapshot = fixture()
    const before = structuredClone(snapshot)
    const projected = projectViewport(snapshot, viewport, playerId)
    expect(ids(projected.characters)).toEqual([playerId, 'inside', 'margin'])
    for (const entries of [
        projected.items,
        projected.chests,
        projected.graves,
        projected.portals,
        projected.magicEffects,
        projected.adventure?.farmPlots,
        projected.adventure?.resourceNodes,
        projected.adventure?.worldObjects,
    ]) {
        expect(ids(entries)).toEqual(['inside', 'margin'])
    }
    expect(snapshot).toEqual(before)
    expect(projected.characters[0]).toBe(snapshot.characters[0])
})

it('includes the 15 percent outer margin plus the sprite footprint on all four sides', () => {
    const snapshot = fixture()
    const positions = [
        { id: 'left', x: 53, y: 150 },
        { id: 'right', x: 247, y: 150 },
        { id: 'top', x: 150, y: 53 },
        { id: 'bottom', x: 150, y: 247 },
        { id: 'corner', x: 215, y: 215 },
        { id: 'past-left', x: 52.99, y: 150 },
        { id: 'past-right', x: 247.01, y: 150 },
        { id: 'past-top', x: 150, y: 52.99 },
        { id: 'past-bottom', x: 150, y: 247.01 },
    ]
    snapshot.items = positions.map(({ id, x, y }) => ({
        id,
        itemId: 'food',
        position: { x, y },
    }))
    expect(ids(projectViewport(snapshot, viewport, playerId).items)).toEqual([
        'left',
        'right',
        'top',
        'bottom',
        'corner',
    ])
})

it('retains bounds and area effects intersecting the view even when their centers are outside', () => {
    const snapshot = fixture()
    const position = { x: 250, y: 150 }
    const bounds = { x: 210, y: 130, width: 80, height: 40 }
    snapshot.chests = [
        {
            id: 'wide-chest',
            position,
            bounds,
            state: 'closed',
            itemCount: 1,
        },
    ]
    snapshot.magicEffects = [
        {
            id: 'chains-overlap',
            abilityId: 'chains',
            center: position,
            radius: 40,
            expiresAt: 20_000,
        },
        {
            id: 'fire-overlap',
            abilityId: 'fireball',
            phase: 'impact',
            position,
            direction: { x: -1, y: 0 },
            radius: 40,
            expiresAt: 20_000,
        },
        {
            id: 'chains-outside',
            abilityId: 'chains',
            center: { x: 400, y: 150 },
            radius: 30,
            expiresAt: 20_000,
        },
    ]
    if (snapshot.adventure === undefined) {
        throw new Error('Missing adventure')
    }
    snapshot.adventure.resourceNodes = [
        {
            id: 'wide-tree',
            locationId: CENTER_LOCATION_ID,
            position,
            bounds,
            kind: 'wood',
            remaining: 1,
        },
    ]
    snapshot.adventure.worldObjects = [
        {
            id: 'wide-water',
            kind: 'water',
            name: 'A pond',
            position,
            bounds,
            depleted: false,
        },
    ]
    const projected = projectViewport(snapshot, viewport, playerId)
    expect(ids(projected.chests)).toEqual(['wide-chest'])
    expect(ids(projected.magicEffects)).toEqual([
        'chains-overlap',
        'fire-overlap',
    ])
    expect(ids(projected.adventure?.resourceNodes)).toEqual(['wide-tree'])
    expect(ids(projected.adventure?.worldObjects)).toEqual(['wide-water'])
})

it('preserves private panels and earned disclosure while the camera changes', () => {
    const snapshot = fixture()
    const visible = snapshot.characters.find((entry) => entry.id === 'inside')
    if (visible === undefined) {
        throw new Error('Missing visible character')
    }
    visible.health = { kind: 'percent', percent: 35 }
    visible.inventory = []
    snapshot.chest = { chestId: 'outside', items: [], gold: 9 }
    snapshot.automation = {
        markers: [],
        scenarios: [],
        run: null,
        helpers: [],
    }
    snapshot.party = {
        partyId: 'party',
        leaderId: playerId,
        members: [
            {
                id: 'outside',
                nickname: 'Far party member',
                locationId: CENTER_LOCATION_ID,
                alive: true,
                hpPercent: 70,
                online: true,
            },
        ],
        activeJobs: [],
        invitations: [],
        jobs: [],
        notice: null,
    }
    const before = structuredClone(snapshot)
    const projected = projectViewport(snapshot, viewport, playerId)
    expect(projected.chest).toEqual(snapshot.chest)
    expect(projected.party).toEqual(snapshot.party)
    expect(projected.automation).toEqual(snapshot.automation)
    expect(projected.adventure?.dialogue).toEqual(snapshot.adventure?.dialogue)
    expect(projected.adventure?.quest).toEqual(snapshot.adventure?.quest)
    expect(projected.adventure?.gold).toBe(17)
    expect(projected.adventure?.noticeId).toBe(3)
    expect(projected.characters.find((entry) => entry.id === 'inside')).toEqual(
        visible
    )

    const moved: SetViewportClientMessage = {
        ...viewport,
        bounds: { left: 950, top: 950, right: 1050, bottom: 1050 },
    }
    expect(ids(projectViewport(snapshot, moved, playerId).characters)).toEqual([
        playerId,
        'outside',
    ])
    expect(projectViewport(snapshot, viewport, playerId)).toEqual(projected)
    expect(snapshot).toEqual(before)
})
