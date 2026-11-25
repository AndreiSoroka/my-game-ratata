import assert from 'node:assert/strict'

import {
    CENTER_LOCATION_ID,
    type GameEventPayload,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { canAutoOpenDoors, findActorPath } from '../src/game/doorNavigation'
import { advanceEchoReturn, type EchoReturn } from '../src/game/echoReturn'
import { containsBuildingPoint } from '../src/game/mapBuildings'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import {
    characterMovementIntent,
    travelRoomCharacter,
} from '../src/game/roomTravel'
import { WorldLocations } from '../src/game/worldLocations'
import { WorldMaps } from '../src/game/worldMaps'

const deltaMs = 50
const inn = {
    id: 'inn',
    kind: 'inn',
    name: 'Таверна «Три дороги»',
    bounds: { x: 32, y: 16, width: 112, height: 96 },
    entry: { x: 88, y: 104 },
    interior: { x: 88, y: 56 },
}
const start = { x: 88, y: 136 }
const leftSeat = { x: 72, y: 72 }
const rightSeat = { x: 104, y: 72 }

it('walks from the neighboring region to a side of the authored inn', () => {
    const world = generatedWorld()
    const from = 'map-1-2'
    const navigation = world.get(from).navigation
    const { width, height } = navigation.grid
    const origin = navigation.findWalkableTileNear({
        x: width - 5,
        y: Math.floor(height / 2),
    })
    assert(origin !== undefined)
    const actor = echo('regional', navigation.tileToWorld(origin), from)

    expect(runHome(actor, world)).toEqual([from, CENTER_LOCATION_ID])
    const tavern = world
        .get()
        .navigation.grid.buildings?.find(({ kind }) => kind === 'inn')
    assert(tavern !== undefined)
    expect(containsBuildingPoint(tavern.bounds, actor.position)).toBe(true)
    expect(actor.position.x).not.toBe(tavern.entry.x)
})

it.each([
    ['dungeon-small', ['dungeon-small']],
    [
        'dungeon-small-floor-3',
        ['dungeon-small-floor-3', 'dungeon-small-floor-2', 'dungeon-small'],
    ],
])('returns an Echo from the occupied upward trigger in %s', (from, floors) => {
    const world = generatedWorld()
    const stairs = world
        .get(from)
        .navigation.grid.dungeonPassages?.find(
            ({ direction }) => direction === 'up'
        )
    assert(stairs !== undefined)
    const actor = echo('underground', stairs.position, from)

    expect(runHome(actor, world)).toEqual([...floors, CENTER_LOCATION_ID])
    expect(actor.hasPath()).toBe(false)
})

it('takes the road around a tower trigger when returning across a surface map', () => {
    const from = 'map-1-2'
    const actor = echo('tower-road', { x: 24, y: 72 }, from)
    const passage = { x: 104, y: 72 }
    const navigation = new NavigationService({
        id: from,
        width: 14,
        height: 9,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(14 * 9).fill(false),
        dungeonPassages: [
            {
                id: 'surface-stairs',
                destinationPassageId: 'crypt-up',
                direction: 'down',
                destinationLocationId: 'dungeon-small',
                position: passage,
                arrival: { x: 104, y: 88 },
                triggerRadius: 7,
            },
        ],
    })
    const east = { x: 216, y: 72 }
    expect(navigation.findPathWorld(actor.position, east)).toContainEqual(
        passage
    )

    advanceEchoReturn(
        actor,
        { navigationFor: () => navigation, charactersFor: () => [actor] },
        {},
        0
    )

    expect(actor.path.at(-1)).toEqual(east)
    expect(actor.path).not.toContainEqual(passage)
})

it('opens a closed door on the chosen return path and reserves two distinct seats', () => {
    const first = echo('first')
    const second = echo('second')
    const fixture = localInn([first, second])
    expect(findActorPath(fixture.navigation, first, leftSeat)).toEqual([])

    const firstRoute: EchoReturn = {}
    const secondRoute: EchoReturn = {}
    fixture.plan(first, firstRoute, 0)
    fixture.plan(second, secondRoute, 0)
    expect(canAutoOpenDoors(first)).toBe(true)
    expect(first.path.at(-1)).toEqual(leftSeat)
    expect(second.path.at(-1)).toEqual(rightSeat)
    fixture.walk([
        [first, firstRoute],
        [second, secondRoute],
    ])

    expect(fixture.navigation.door('inn-door')?.state).toBe('open')
    expect(fixture.events).toContainEqual(
        expect.objectContaining({
            actorId: first.id,
            kind: 'door_interact',
            objectId: 'inn-door',
        })
    )
    expect(first.position).toEqual(leftSeat)
    expect(second.position).toEqual(rightSeat)
    expect(canAutoOpenDoors(first)).toBe(false)
})

it('replaces a seat when another character starts a route to it', () => {
    const actor = echo('incoming')
    const other = echo('arriving-player', { x: 168, y: 136 })
    other.connected = true
    const fixture = localInn([actor, other])
    const route: EchoReturn = {}
    fixture.plan(actor, route, 0)
    expect(actor.path.at(-1)).toEqual(leftSeat)

    other.setPath([leftSeat])
    fixture.plan(actor, route, 500)

    expect(actor.path.at(-1)).toEqual(rightSeat)
    fixture.walk([[actor, route]], 500)
    expect(actor.position).toEqual(rightSeat)
})

it('waits outside to one side when the inn is full and retries when a seat frees up', () => {
    const actor = echo('waiting')
    const left = echo('left', leftSeat)
    const right = echo('right', rightSeat)
    const fixture = localInn([actor, left, right])
    const route: EchoReturn = {}

    fixture.walk([[actor, route]])
    expect(containsBuildingPoint(inn.bounds, actor.position)).toBe(false)
    expect(actor.position.x).not.toBe(inn.entry.x)
    expect(actor.position.y).toBeGreaterThan(inn.entry.y)
    expect(fixture.navigation.door('inn-door')?.state).toBe('closed')
    expect(actor.hasPath()).toBe(false)

    fixture.actors.delete(left.id)
    fixture.walk([[actor, route]], 3_000)

    expect(actor.position).toEqual(leftSeat)
    expect(route.inn?.seated).toBe(true)
})

function echo(
    id: string,
    position = start,
    locationId = CENTER_LOCATION_ID
): GameCharacter {
    const actor = new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        controllerKind: 'network_player',
        locationId,
        spawnPosition: position,
        spawnedAt: 0,
        soul: { controlSource: 'script' },
    })
    actor.connected = false
    return actor
}

function generatedWorld(): WorldLocations {
    const maps = new WorldMaps({ seed: 'dungeon-832' })
    return new WorldLocations(
        maps.navigation(CENTER_LOCATION_ID),
        undefined,
        maps
    )
}

function runHome(actor: GameCharacter, world: WorldLocations): string[] {
    const actors = new Map([[actor.id, actor]])
    const environment = {
        navigationFor: (character: Pick<GameCharacter, 'locationId'>) =>
            world.get(character.locationId).navigation,
        charactersFor: () => [actor],
    }
    const route: EchoReturn = {}
    const visited = [actor.locationId]
    for (
        let now = 10_000;
        now <= 85_000 && !route.inn?.seated;
        now += deltaMs
    ) {
        advanceEchoReturn(actor, environment, route, now)
        const before = { ...actor.position }
        const intent = characterMovementIntent(actor, now, deltaMs)
        advanceCharacter({
            character: actor,
            navigation: environment.navigationFor(actor),
            now,
            deltaMs,
        })
        travelRoomCharacter(actor, intent, world, actors, now, before)
        if (actor.locationId !== visited.at(-1)) {
            visited.push(actor.locationId)
        }
    }
    expect(route.inn?.seated).toBe(true)
    return visited
}

function localInn(characters: GameCharacter[]) {
    const width = 14
    const height = 11
    const solid = Array.from({ length: width * height }, (_, index) => {
        const x = index % width
        const y = Math.floor(index / width)
        if (x < 2 || x > 8 || y < 1 || y > 6) {
            return false
        }
        return !((x === 5 && y >= 2) || (y === 4 && [4, 6].includes(x)))
    })
    const navigation = new NavigationService({
        id: CENTER_LOCATION_ID,
        width,
        height,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid,
        buildings: [inn],
        doors: [
            {
                id: 'inn-door',
                locationId: CENTER_LOCATION_ID,
                initialState: 'closed',
                bounds: { x: 80, y: 96, width: 16, height: 16 },
            },
        ],
    })
    const actors = new Map(
        characters.map((character) => [character.id, character])
    )
    const environment = {
        navigationFor: () => navigation,
        charactersFor: () => [...actors.values()],
    }
    const events: GameEventPayload[] = []
    const plan = (actor: GameCharacter, route: EchoReturn, now: number) =>
        advanceEchoReturn(actor, environment, route, now)
    return {
        actors,
        events,
        navigation,
        plan,
        walk(travellers: Array<[GameCharacter, EchoReturn]>, startAt = 0) {
            for (let now = startAt; now < startAt + 3_000; now += deltaMs) {
                for (const [actor, route] of travellers) {
                    plan(actor, route, now)
                }
                for (const [actor] of travellers) {
                    advanceCharacter({
                        character: actor,
                        navigation,
                        now,
                        deltaMs,
                        onEvents: (newEvents) => events.push(...newEvents),
                    })
                }
            }
        },
    }
}
