import {
    CENTER_LOCATION_ID,
    type DoorAction,
    type GameEventPayload,
    type Vector2,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { parseAgentDecision } from '../src/game/agentDecisionParsing'
import { GameCharacter } from '../src/game/character'
import { findActorPath } from '../src/game/doorNavigation'
import { parseClientMessage } from '../src/game/messages'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import type { WorldObjectDefinition } from '../src/game/worldObjectData'

const doorway = { x: 48, y: 32, width: 16, height: 16 }
const locked = { ...doorway, x: 80 }
const outdoors = { x: 56, y: 56 }
const indoors = { x: 56, y: 24 }
const now = 10_000

function actor(
    id: string,
    position: Vector2,
    controllerKind: GameCharacter['controllerKind'] = 'network_player'
) {
    return new GameCharacter({
        id,
        archetype: 'human',
        nickname: id,
        controllerKind,
        spawnPosition: position,
    })
}

function fixture() {
    const width = 7
    const height = 5
    const solid = Array<boolean>(width * height).fill(false)
    for (let x = 0; x < width; x++) {
        solid[2 * width + x] = x !== 3
    }
    const doors = [
        { id: 'door', initialState: 'closed', bounds: doorway },
        { id: 'locked', initialState: 'locked', bounds: locked },
    ] as const
    const objects: WorldObjectDefinition[] = doors.map(
        ({ id, initialState, bounds }) => ({
            id,
            kind: 'door',
            name: id,
            text: '',
            doorState: initialState,
            bounds,
            locationId: CENTER_LOCATION_ID,
        })
    )
    const navigation = new NavigationService({
        id: CENTER_LOCATION_ID,
        height,
        width,
        tileHeight: 16,
        tileWidth: 16,
        solid,
        solidLayerNames: [],
        doors: doors.map((door) => ({
            ...door,
            locationId: CENTER_LOCATION_ID,
        })),
    })
    const adventure = new AdventureService({
        worldObjects: objects,
        navigationForLocation: () => navigation,
    })
    const use = (
        actor: GameCharacter,
        doorAction: DoorAction,
        occupants: GameCharacter[] = [],
        objectId = 'door'
    ) =>
        adventure.handleResult(
            actor,
            { type: 'world_interact', objectId, doorAction },
            occupants,
            navigation,
            now
        )
    return { adventure, navigation, use }
}

it('shares the door state, rejects closing on a character and accepts explicit actions from both sides', () => {
    const { adventure, navigation, use } = fixture()
    const outside = actor('outside', outdoors)
    const inside = actor('inside', indoors)
    expect(navigation.findPathWorld(outdoors, indoors)).toEqual([])
    expect(navigation.hasLineOfSight(outdoors, indoors)).toBe(false)
    expect(
        navigation.moveWithCollision(outdoors, { x: 0, y: -32 }).y
    ).toBeGreaterThanOrEqual(48)

    expect(use(outside, 'open').events).toMatchObject([
        { kind: 'door_interact', objectId: 'door' },
    ])
    expect(use(outside, 'open')).toEqual({
        accepted: true,
        error: null,
        events: [],
    })
    expect(adventure.snapshot(inside.id).worldObjects?.[0]?.door).toEqual({
        state: 'open',
    })
    expect(navigation.hasLineOfSight(outdoors, indoors)).toBe(true)
    expect(navigation.findPathWorld(outdoors, indoors).at(-1)).toEqual(indoors)

    const occupant = actor('occupant', { x: 56, y: 40 })
    expect(use(inside, 'close', [outside, occupant]).accepted).toBe(false)
    expect(navigation.door('door')?.state).toBe('open')
    occupant.locationId = 'map-1-2'
    expect(use(inside, 'close', [outside, occupant]).events).toHaveLength(1)
    expect(adventure.snapshot(outside.id).worldObjects?.[0]?.door).toEqual({
        state: 'closed',
    })
    expect(use(occupant, 'open', [outside]).accepted).toBe(false)
})

it('keeps a locked facade solid, limits repeat knocks and parses the same explicit intent for players and agents', () => {
    const { navigation, use } = fixture()
    const outside = actor('knocker', { x: 88, y: 56 })
    const message = {
        type: 'world_interact',
        objectId: 'locked',
        doorAction: 'knock',
    }
    expect(parseClientMessage(JSON.stringify(message))).toEqual({ message })
    expect(parseAgentDecision(message)).toEqual(message)
    expect(
        parseClientMessage(JSON.stringify({ ...message, doorAction: 'toggle' }))
    ).toEqual({
        error: 'Invalid door action.',
    })
    expect(use(outside, 'open', [], 'locked').accepted).toBe(false)
    expect(use(outside, 'knock', [], 'locked').events).toHaveLength(1)
    expect(use(outside, 'knock', [], 'locked').events).toHaveLength(0)
    expect(navigation.door('locked')?.state).toBe('locked')
    expect(
        navigation.findPathWorld(outside.position, { x: 88, y: 40 }, true)
    ).toEqual([])
})

it('lets a scripted pedestrian open a closed doorway on its planned route without clearing resource collision', () => {
    const { navigation } = fixture()
    const pedestrian = actor('pedestrian', outdoors, 'scripted')
    const player = actor('player', outdoors)
    const obstacle = { x: 0, y: 0, width: 16, height: 16 }
    navigation.setResourceObstacles([obstacle])
    expect(navigation.isSolidTile({ x: 3, y: 2 })).toBe(true)
    expect(findActorPath(navigation, player, indoors)).toEqual([])
    const path = findActorPath(navigation, pedestrian, indoors)
    expect(path).toEqual([{ x: 56, y: 40 }, indoors])
    pedestrian.setPath(path)
    const events: GameEventPayload[] = []
    for (let tick = 1; tick <= 20; tick++) {
        advanceCharacter({
            character: pedestrian,
            navigation,
            deltaMs: 50,
            now: now + tick * 50,
            onEvents: (step) => events.push(...step),
        })
    }
    expect(pedestrian.position).toEqual(indoors)
    expect(events.filter(({ kind }) => kind === 'door_interact')).toMatchObject(
        [{ actorId: pedestrian.id, objectId: 'door' }]
    )
    expect(navigation.isSolidTile({ x: 0, y: 0 })).toBe(true)
    expect(navigation.isSolidTile({ x: 3, y: 2 })).toBe(false)
})
