import assert from 'node:assert/strict'

import { CENTER_LOCATION_ID, type Vector2 } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import type { CompanionWorld } from '../src/game/agentDecisions'
import { GameCharacter } from '../src/game/character'
import { enqueueCharacterRoute } from '../src/game/characterRoute'
import { companionSoul } from '../src/game/companionProfiles'
import { CompanionService } from '../src/game/companions'
import { validateDungeonLinks } from '../src/game/dungeonLinks'
import type { DungeonPassage } from '../src/game/dungeonMapData'
import { createItemInstance } from '../src/game/inventory'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import { PartyService } from '../src/game/parties'
import {
    characterMovementIntent,
    travelRoomCharacter,
} from '../src/game/roomTravel'
import { WorldLocations } from '../src/game/worldLocations'
import { WorldMaps } from '../src/game/worldMaps'
import { crossedDungeonPassage } from '../src/game/worldPassages'
import { chestHero } from './chestTestHelpers'

const floors = [
    'dungeon-small',
    'dungeon-small-floor-2',
    'dungeon-small-floor-3',
] as const

it('walks both ways through all floors without replacing the player or regional quest credit', () => {
    const world = smallDungeon()
    const tower = passage(world, CENTER_LOCATION_ID, 'down')
    const player = chestHero('explorer', tower.arrival)
    player.inventory.push(createItemInstance('food'))
    const inventory = [...player.inventory]
    const clerk = new GameCharacter({
        id: 'npc_friendly_girl_1',
        nickname: 'Mira',
        archetype: 'human',
        controllerKind: 'scripted',
        spawnPosition: tower.arrival,
    })
    const characters = new Map([
        [player.id, player],
        [clerk.id, clerk],
    ])
    const parties = new PartyService(undefined, {
        canContact: (_actor, npc) => npc === clerk,
        scoutingLocationId: world.scoutingLocationId,
    })
    parties.handle(
        player,
        { type: 'guild_accept', questId: 'survey_frontier' },
        characters.values(),
        1_000
    )

    const route = [
        tower,
        passage(world, floors[0], 'down'),
        passage(world, floors[1], 'down'),
        passage(world, floors[2], 'up'),
        passage(world, floors[1], 'up'),
        passage(world, floors[0], 'up'),
    ]
    const visited: string[] = []
    const clock = { now: 1_000 }
    for (const next of route) {
        const from = player.locationId
        const notice = walkThrough(world, player, next, clock)
        expect(player.locationId).toBe(next.destinationLocationId)
        const arrived = world
            .get(player.locationId)
            .navigation.grid.dungeonPassages?.find(
                ({ id }) => id === next.destinationPassageId
            )
        assert(arrived !== undefined)
        expect(arrived.destinationLocationId).toBe(from)
        expect(player.position).toEqual(arrived.arrival)
        expect(player.getMoveInput()).toEqual({ x: 0, y: 0 })
        expect(player.inventory).toEqual(inventory)
        expect(
            world.travel(
                player,
                { x: 0, y: -1 },
                clock.now + 1,
                arrived.arrival
            )
        ).toBeUndefined()
        const definition = world.get(player.locationId).description
        if (definition.floor !== undefined) {
            expect(definition).toMatchObject({
                dungeonId: floors[0],
                floorCount: 3,
                surfaceLocationId: CENTER_LOCATION_ID,
            })
            expect(notice).toContain(`этаж ${String(definition.floor)} из 3`)
        }
        parties.update(characters.values(), clock.now)
        visited.push(player.locationId)
    }
    expect(visited).toEqual([
        ...floors,
        floors[1],
        floors[0],
        CENTER_LOCATION_ID,
    ])
    expect(parties.snapshot(player.id).activeJobs[0]?.progress).toBe(1)
    expect(world.get(floors[2]).navigation.grid.dungeonPassages).toMatchObject([
        { direction: 'up' },
    ])
    expect(new Set(floors.map((id) => world.get(id).inventory)).size).toBe(3)
    expect(world.get(floors[0]).description.map.asset.revision).not.toBe(
        world.get(floors[2]).description.map.asset.revision
    )
})

it('lets a consenting companion catch up across two unobserved intermediate stairs', () => {
    const world = smallDungeon()
    const tower = passage(world, CENTER_LOCATION_ID, 'down')
    const leader = chestHero('explorer', tower.arrival)
    const bran = new GameCharacter({
        id: 'npc_veteran_1',
        nickname: 'Бран',
        archetype: 'human',
        controllerKind: 'scripted',
        faction: leader.faction,
        soul: companionSoul('npc_veteran_1'),
        spawnPosition: tower.position,
    })
    const actors = new Map([
        [leader.id, leader],
        [bran.id, bran],
    ])
    const companionWorld: CompanionWorld = {
        navigationFor: (actor) => world.get(actor.locationId).navigation,
        nextLocationToward: world.nextLocationToward,
        getCharacter: (id) => actors.get(id),
        findVisibleTarget: () => undefined,
        requestAttack: () => undefined,
    }
    const companions = new CompanionService()
    const clock = { now: 1_000 }
    expect(
        companions.applyModelOrder(
            leader,
            bran,
            { type: 'companion_request', targetId: bran.id, request: 'follow' },
            clock.now,
            {
                modelConsent: true,
                questCompleted: () => false,
                hasLineOfSight: (actor, npc) =>
                    companionWorld
                        .navigationFor(actor)
                        .hasLineOfSight(actor.position, npc.position),
            }
        )
    ).toEqual({ accepted: true })

    for (const entry of [
        tower,
        passage(world, floors[0], 'down'),
        passage(world, floors[1], 'down'),
    ]) {
        expect(walkThrough(world, leader, entry, clock)).toBeDefined()
    }
    const visited: string[] = []
    const deltaMs = 50
    for (
        let elapsed = 0;
        elapsed < 75_000 && bran.locationId !== leader.locationId;
        elapsed += deltaMs
    ) {
        clock.now += deltaMs
        companions.update(bran, companionWorld, clock.now)
        const before = { ...bran.position }
        const intent = characterMovementIntent(bran, clock.now, deltaMs)
        advanceCharacter({
            character: bran,
            deltaMs,
            navigation: companionWorld.navigationFor(bran),
            now: clock.now,
        })
        travelRoomCharacter(bran, intent, world, actors, clock.now, before)
        if (
            bran.locationId !== CENTER_LOCATION_ID &&
            bran.locationId !== visited.at(-1)
        ) {
            visited.push(bran.locationId)
        }
    }
    expect(visited).toEqual(floors)
    expect(bran.soul.companion).toMatchObject({
        leaderId: leader.id,
        order: 'follow',
    })
})

it('routes through intermediate floors and rejects a nonreciprocal link', () => {
    const world = smallDungeon()
    expect(world.nextLocationToward(CENTER_LOCATION_ID, floors[2])).toBe(
        floors[0]
    )
    expect(world.nextLocationToward(floors[0], floors[2])).toBe(floors[1])
    expect(world.nextLocationToward(floors[2], CENTER_LOCATION_ID)).toBe(
        floors[1]
    )
    expect(world.nextLocationToward(floors[2], 'map-2-1')).toBe(floors[1])
    expect(world.nextLocationToward(floors[2], 'missing-floor')).toBeUndefined()
    expect(world.nextLocationToward(floors[2], floors[2])).toBeUndefined()

    const { grid } = world.get(floors[1]).navigation
    grid.dungeonPassages = (grid.dungeonPassages ?? []).map((entry) =>
        entry.direction === 'down'
            ? { ...entry, destinationPassageId: 'wrong-landing' }
            : entry
    )
    expect(() => validateDungeonLinks(world.locations)).toThrow(
        'Invalid dungeon link'
    )
})

it('walks to the downstairs on the third floor without crossing the entry stairs', () => {
    const maps = new WorldMaps({ seed: 'dungeon-7' })
    const world = new WorldLocations(
        maps.navigation(CENTER_LOCATION_ID),
        undefined,
        maps
    )
    const from = floors[2]
    const up = passage(world, from, 'up')
    const down = passage(world, from, 'down')
    const player = chestHero('late explorer', up.arrival)
    player.locationId = from
    const unfilteredPath = world
        .get(from)
        .navigation.findPathWorld(up.arrival, down.position)
    expect(
        unfilteredPath.some((point, index) => {
            const previous = unfilteredPath[index - 1] ?? up.arrival
            return (
                crossedDungeonPassage(
                    world.get(from).navigation,
                    previous,
                    point,
                    {
                        x: point.x - previous.x,
                        y: point.y - previous.y,
                    }
                ) === up
            )
        })
    ).toBe(true)
    expect(walkThrough(world, player, down, { now: 1_000 })).toBeDefined()
    expect(player.locationId).toBe('dungeon-small-floor-4')
})

it('chooses the earliest trigger crossed by a movement segment independent of array order', () => {
    const navigation = new NavigationService({
        id: floors[1],
        width: 12,
        height: 8,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(96).fill(false),
        solidLayerNames: [],
        dungeonPassages: [
            testPassage('down', { x: 104, y: 72 }, floors[2]),
            testPassage('up', { x: 56, y: 72 }, floors[0]),
        ],
    })
    const start = { x: 24, y: 72 }
    const end = { x: 136, y: 72 }
    expect(
        crossedDungeonPassage(navigation, start, end, { x: 1, y: 0 })?.direction
    ).toBe('up')
    expect(
        crossedDungeonPassage(navigation, end, start, { x: -1, y: 0 })
            ?.direction
    ).toBe('down')
    expect(
        crossedDungeonPassage(navigation, { x: 56, y: 72 }, end, { x: 1, y: 0 })
            ?.direction
    ).toBe('down')
    expect(
        crossedDungeonPassage(navigation, start, start, { x: 1, y: 0 })
    ).toBeUndefined()
})

function testPassage(
    direction: DungeonPassage['direction'],
    position: Vector2,
    destinationLocationId: string
): DungeonPassage {
    return {
        id: direction,
        direction,
        destinationLocationId,
        destinationPassageId: 'opposite',
        position,
        arrival: { ...position, y: position.y + 16 },
        triggerRadius: 6,
    }
}

function passage(
    world: WorldLocations,
    id: string,
    direction: DungeonPassage['direction']
): DungeonPassage {
    const found = world
        .get(id)
        .navigation.grid.dungeonPassages?.find(
            (entry) => entry.direction === direction
        )
    assert(found !== undefined, `Missing ${direction} staircase in ${id}`)
    return found
}

function smallDungeon(): WorldLocations {
    const maps = new WorldMaps({ seed: 'dungeon-832' })
    return new WorldLocations(
        maps.navigation(CENTER_LOCATION_ID),
        undefined,
        maps
    )
}

function walkThrough(
    world: WorldLocations,
    actor: GameCharacter,
    next: DungeonPassage,
    clock: { now: number }
): string | undefined {
    const from = actor.locationId
    const { navigation } = world.get(from)
    expect(
        enqueueCharacterRoute(
            actor,
            next.position,
            false,
            navigation,
            clock.now
        ).accepted
    ).toBe(true)
    const actors = new Map([[actor.id, actor]])
    const deltaMs = 50
    for (let elapsed = 0; elapsed < 40_000; elapsed += deltaMs) {
        clock.now += deltaMs
        const before = { ...actor.position }
        const intent = characterMovementIntent(actor, clock.now, deltaMs)
        advanceCharacter({
            character: actor,
            deltaMs,
            navigation,
            now: clock.now,
        })
        const notice = travelRoomCharacter(
            actor,
            intent,
            world,
            actors,
            clock.now,
            before
        )
        if (actor.locationId !== from) {
            return notice
        }
    }
    return undefined
}
