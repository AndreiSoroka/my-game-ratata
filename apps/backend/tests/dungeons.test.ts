import assert from 'node:assert/strict'

import {
    CENTER_LOCATION_ID,
    PORTAL_LIFETIME_MS,
} from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { resolveCharacterDamage } from '../src/game/abilityDamage'
import type { CompanionWorld } from '../src/game/agentDecisions'
import { GameCharacter } from '../src/game/character'
import { shouldRetireCharacter } from '../src/game/characterLife'
import { tickCharacterTimedState } from '../src/game/characterRecovery'
import { enqueueCharacterRoute } from '../src/game/characterRoute'
import { companionSoul } from '../src/game/companionProfiles'
import { CompanionService } from '../src/game/companions'
import { createItemInstance } from '../src/game/inventory'
import { advanceCharacter } from '../src/game/movement'
import { advancePursuit } from '../src/game/pursuit'
import { pursuits } from '../src/game/pursuitState'
import { GameRoom } from '../src/game/room'
import {
    characterMovementIntent,
    travelRoomCharacter,
} from '../src/game/roomTravel'
import { WorldLocations } from '../src/game/worldLocations'
import { WorldMaps } from '../src/game/worldMaps'
import {
    crossedDungeonPassage,
    nextLocationToward,
} from '../src/game/worldPassages'
import { chestHero, joinChestRoom } from './chestTestHelpers'

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

it('loads reciprocal passages on the same generated maps and only crosses during actual motion', () => {
    const maps = new WorldMaps({ seed: 'dungeon-9', epoch: 'dungeons' })
    const world = new WorldLocations(
        maps.navigation(CENTER_LOCATION_ID),
        undefined,
        maps
    )
    const dungeon = world.get('dungeon-small')
    expect(dungeon.description).toMatchObject({
        biome: 'dungeon',
        dungeonSize: 'small',
        surfaceLocationId: CENTER_LOCATION_ID,
    })
    const tower = world.get().navigation.grid.dungeonPassages?.[0]
    const exit = dungeon.navigation.grid.dungeonPassages?.find(
        ({ direction }) => direction === 'up'
    )
    assert(tower !== undefined && exit !== undefined)
    expect(tower.triggerRadius).toBe(7)
    expect(exit.triggerRadius).toBe(12)
    expect(exit.arrival.y - exit.position.y).toBe(
        dungeon.navigation.grid.tileHeight
    )
    const north = { x: 0, y: -1 }
    for (const side of [-1, 1]) {
        const offset = (side * dungeon.navigation.grid.tileWidth) / 2
        expect(
            crossedDungeonPassage(
                dungeon.navigation,
                { x: exit.arrival.x + offset, y: exit.arrival.y },
                { x: exit.position.x + offset, y: exit.position.y },
                north
            )
        ).toBe(exit)
    }
    const player = chestHero('explorer')
    player.inventory.push(createItemInstance('food'))
    const inventory = [...player.inventory]
    player.position = { ...tower.position }
    expect(world.travel(player, north, 10_000, tower.position)).toBeUndefined()
    player.connected = false
    player.tags.add('offline')
    expect(world.travel(player, north, 10_000, tower.arrival)).toBeUndefined()
    player.tags.delete('offline')
    player.connected = true
    player.setMoveInput(north)
    expect(world.travel(player, north, 10_000, tower.arrival)).toBeDefined()
    expect(player).toMatchObject({
        locationId: dungeon.description.id,
        position: exit.arrival,
        inventory,
    })
    expect(player.getMoveInput()).toEqual({ x: 0, y: 0 })
    expect(world.travel(player, north, 10_001, exit.arrival)).toBeUndefined()
    expect(world.mapAsset('dungeons', dungeon.description.id)).toBeDefined()
    expect(world.mapAsset('stale', dungeon.description.id)).toBeUndefined()

    player.position = { ...exit.position }
    player.alive = false
    expect(world.travel(player, north, 11_000, exit.arrival)).toBeUndefined()
    player.alive = true
    expect(world.travel(player, north, 12_000, exit.arrival)).toBeDefined()
    expect(player).toMatchObject({
        locationId: CENTER_LOCATION_ID,
        position: tower.arrival,
        inventory,
        id: 'explorer',
    })
})

it('lets an agreeing Bran re-enter the tower threshold and follow back through the arch', () => {
    const maps = new WorldMaps({ seed: 'dungeon-9' })
    const world = new WorldLocations(
        maps.navigation(CENTER_LOCATION_ID),
        undefined,
        maps
    )
    const tower = world.get().navigation.grid.dungeonPassages?.[0]
    assert(tower !== undefined)
    const exit = world
        .get(tower.destinationLocationId)
        .navigation.grid.dungeonPassages?.find(
            ({ direction }) => direction === 'up'
        )
    assert(exit !== undefined)

    const player = chestHero('explorer', tower.arrival)
    const bran = new GameCharacter({
        archetype: 'human',
        controllerKind: 'scripted',
        faction: player.faction,
        id: 'npc_veteran_1',
        nickname: 'Бран',
        soul: companionSoul('npc_veteran_1'),
        spawnPosition: tower.position,
    })
    const actors = new Map([
        [player.id, player],
        [bran.id, bran],
    ])
    const companionWorld: CompanionWorld = {
        getCharacter: (id) => actors.get(id),
        navigationFor: (actor) => world.get(actor.locationId).navigation,
        nextLocationToward: world.nextLocationToward,
        findVisibleTarget: () => undefined,
        requestAttack: () => undefined,
    }
    const service = new CompanionService()
    let now = 10_000
    expect(
        service.applyModelOrder(
            player,
            bran,
            { type: 'companion_request', targetId: bran.id, request: 'follow' },
            now,
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

    const deltaMs = 50
    for (const passage of [tower, exit]) {
        expect(
            enqueueCharacterRoute(
                player,
                passage.position,
                false,
                companionWorld.navigationFor(player),
                now
            ).accepted
        ).toBe(true)
        for (let elapsed = 0; elapsed < 3_000; elapsed += deltaMs) {
            now += deltaMs
            service.update(bran, companionWorld, now)
            for (const character of actors.values()) {
                const before = { ...character.position }
                const intent = characterMovementIntent(character, now, deltaMs)
                advanceCharacter({
                    character,
                    deltaMs,
                    navigation: companionWorld.navigationFor(character),
                    now,
                })
                travelRoomCharacter(
                    character,
                    intent,
                    world,
                    actors,
                    now,
                    before
                )
            }
            if (bran.locationId === passage.destinationLocationId) {
                break
            }
        }
        expect(player.locationId).toBe(passage.destinationLocationId)
        expect(bran.locationId).toBe(passage.destinationLocationId)
        expect(bran.soul.companion).toMatchObject({
            leaderId: player.id,
            order: 'follow',
        })
    }
})

it('casts a two-way city portal underground and lets a pursuing skeleton cross', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    vi.stubGlobal('Bun', { env: {} })
    const maps = new WorldMaps({ seed: 'dungeon-9' })
    const room = new GameRoom(maps.navigation(CENTER_LOCATION_ID), {
        worldMaps: maps,
    })
    const dungeonId = 'dungeon-small'
    const now = 10_000
    try {
        const { actor } = joinChestRoom(room, 'Dungeon traveller')
        const snapshots = room.snapshot(now, dungeonId).characters
        expect(snapshots).toHaveLength(2)
        const first = snapshots[0]
        assert(first !== undefined)
        const skeleton = room.getCharacter(first.id)
        assert(skeleton !== undefined)
        const navigation = maps.navigation(dungeonId)
        actor.locationId = dungeonId
        const [neighbor] = navigation.walkableNeighbors(
            navigation.worldToTile(skeleton.position)
        )
        assert(neighbor !== undefined)
        actor.position = navigation.tileToWorld(neighbor)
        expect(advancePursuit(skeleton, actor, room, now).target).toBe(actor)

        const context = room.abilityContextFor(actor, now)
        expect(context.canOpenPortal?.(actor, now)).toBe(true)
        context.openPortal?.(actor, now)
        const source = room.snapshot(now, dungeonId).portals?.[0]
        const target = room.snapshot(now, CENTER_LOCATION_ID).portals?.[0]
        assert(source !== undefined && target !== undefined)
        expect(source).toMatchObject({
            destinationLocationId: CENTER_LOCATION_ID,
        })
        expect(target).toMatchObject({ destinationLocationId: dungeonId })
        room.requestPortalUse(actor, source.id, now)
        expect(actor.locationId).toBe(CENTER_LOCATION_ID)
        expect(pursuits.get(skeleton)?.crossing).toMatchObject({
            endpointId: source.id,
        })
        advancePursuit(skeleton, undefined, room, now)
        expect(skeleton.locationId).toBe(CENTER_LOCATION_ID)
        expect(pursuits.get(skeleton)?.foreign?.locationId).toBe(
            CENTER_LOCATION_ID
        )
        room.requestPortalUse(actor, target.id, now + 1)
        expect(actor.locationId).toBe(dungeonId)
        expect(
            nextLocationToward(
                CENTER_LOCATION_ID,
                dungeonId,
                (id) => maps.navigation(id).grid.dungeonPassages
            )
        ).toBe(dungeonId)
        expect(
            room.portalPassageFor(actor, source.id, now + PORTAL_LIFETIME_MS)
        ).toBeUndefined()

        const { blade, undead } = skeleton.progression.masteries
        expect(blade.level).toBe(10)
        expect(undead.level).toBe(12)
        expect(skeleton.maxHp).toBe(80)
        const attacker = chestHero('Portal guard', skeleton.position)
        room.publishEvents(
            resolveCharacterDamage({
                actor: attacker,
                target: skeleton,
                amount: 1_000,
                damageKind: 'physical',
                now: now + 2,
                respawnDelayMs: 15_000,
            }).events
        )
        tickCharacterTimedState(skeleton, now + 100_000)
        expect(skeleton.alive).toBe(false)
        expect(skeleton.reviveUntil).toBe(0)
        expect(shouldRetireCharacter(skeleton, now + 2)).toBe(false)
        expect(
            room.snapshot(now + 2, CENTER_LOCATION_ID).chests
        ).toContainEqual(
            expect.objectContaining({
                id: `corpse:${skeleton.id}:1`,
                itemCount: 2,
            })
        )
    } finally {
        room.stop()
    }
})
