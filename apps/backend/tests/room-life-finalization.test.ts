import {
    CENTER_LOCATION_ID,
    GRAVE_SPAWN_INTERVAL_MS,
} from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { beginRevive } from '../src/game/characterLife'
import { createItemInstance } from '../src/game/inventory'
import { parseClientMessage } from '../src/game/messages'
import { GameRoom } from '../src/game/room'
import { joinChestRoom } from './chestTestHelpers'
import { graveNavigation, roomLifeFixture } from './graveTestHelpers'

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})
const now = 10_000

describe('shared finalization and corpse ownership', () => {
    it('keeps downed possessions protected, then finalizes once at timeout and spawns after another 30 seconds', () => {
        const f = roomLifeFixture()
        const item = createItemInstance('herbs', 4)
        const weapon = createItemInstance('simple_sword')
        f.hero.inventory.push(item)
        f.hero.equipment.weapon = weapon
        f.hero.applyDamage(f.hero.hp, now)
        f.hero.queueRespawn(now, 5_000)
        const inventory = f.world.get(f.hero.locationId).inventory
        f.advance(now + 59_999)
        expect(f.characters.has(f.hero.id)).toBe(true)
        expect(f.life.graves(f.hero.locationId)).toEqual([])
        expect(
            inventory.snapshotChests().some((chest) => chest.kind === 'corpse')
        ).toBe(false)
        f.advance(now + 60_000)
        expect(f.characters.has(f.hero.id)).toBe(false)
        expect(f.connections.get(f.socket)).toBeUndefined()
        expect(f.nicknames.size).toBe(0)
        expect(f.gold.get(f.hero.id)).toBe(0)
        const corpse = inventory
            .snapshotChests()
            .find((chest) => chest.kind === 'corpse')
        expect(corpse).toMatchObject({
            id: `corpse:${f.hero.id}:1`,
            itemCount: 2,
            position: f.hero.position,
        })
        expect(
            f.events.filter((event) => event.kind === 'permadeath')
        ).toHaveLength(1)
        expect(f.life.abandon(f.hero, now + 60_001)).toBe(false)
        f.advance(now + 89_999)
        expect(f.characters.size).toBe(0)
        f.advance(now + 90_000)
        const child = [...f.characters.values()][0]
        expect(child).toMatchObject({
            archetype: 'skeleton',
            locationId: f.hero.locationId,
        })
        expect(child?.equipment.weapon?.instanceId).not.toBe(weapon.instanceId)
        expect(child?.inventory).toEqual([])
        expect(
            inventory.snapshotChests().find((chest) => chest.id === corpse?.id)
        ).toEqual(corpse)
        expect(f.controllers.has(child?.id ?? '')).toBe(true)
    })

    it('abandons early through the same loot path without refunding or duplicating items and gold', () => {
        const f = roomLifeFixture()
        const item = createItemInstance('boots')
        f.hero.inventory.push(item)
        expect(f.life.abandon(f.hero, now)).toBe(false)
        f.hero.applyDamage(f.hero.hp, now)
        expect(f.life.abandon(f.hero, now + 1)).toBe(true)
        expect(f.life.abandon(f.hero, now + 2)).toBe(false)
        expect(
            f.events.filter((event) => event.kind === 'permadeath')
        ).toHaveLength(1)
        const inventory = f.world.get(f.hero.locationId).inventory
        expect(
            inventory
                .snapshotChests()
                .filter((chest) => chest.kind === 'corpse')
        ).toHaveLength(1)
        const viewer = new GameCharacter({
            id: 'viewer',
            nickname: 'viewer',
            archetype: 'human',
            controllerKind: 'network_player',
            locationId: f.hero.locationId,
            spawnPosition: { x: 152, y: 168 },
        })
        inventory.openChestById(viewer, `corpse:${f.hero.id}:1`, now + 2)
        expect(inventory.containers.snapshot(viewer, now + 2)).toMatchObject({
            gold: 37,
        })
        inventory.containers.handle(
            viewer,
            { type: 'take_all_chest_items', chestId: `corpse:${f.hero.id}:1` },
            now + 3
        )
        expect(viewer.inventory).toEqual([item])
        expect(f.gold.get(viewer.id)).toBe(37)
        inventory.containers.handle(
            viewer,
            { type: 'take_all_chest_items', chestId: `corpse:${f.hero.id}:1` },
            now + 4
        )
        expect(f.gold.get(viewer.id)).toBe(37)
        f.advance(now + 30_000)
        expect(f.characters.size).toBe(0)
        f.advance(now + 30_001)
        expect(f.characters.size).toBe(1)
    })
})

it('passes the final hero’s highest mastery level only to the first grave skeleton', () => {
    const f = roomLifeFixture()
    f.hero.progression.masteries.blade.level = 8
    f.hero.progression.masteries.life.level = 4
    f.hero.applyDamage(f.hero.hp, now)

    f.advance(now + 60_000)
    expect(f.hero.progression.masteries.blade.level).toBe(0)
    expect(f.characters.size).toBe(0)

    const birthAt = now + 90_000
    f.advance(birthAt)
    const first = [...f.characters.values()][0]
    if (first === undefined) {
        throw new Error('Expected the first grave skeleton')
    }
    expect(first.progression.masteries.undead.level).toBe(8)
    expect(first.hp).toBe(first.maxHp)
    const firstMaxHp = first.maxHp
    first.progression.constellations.opened.add('undead.imprint')
    expect(first.maxHp).toBe(firstMaxHp + 10)

    f.advance(birthAt + GRAVE_SPAWN_INTERVAL_MS)
    const second = [...f.characters.values()].find(
        (character) => character.id !== first.id
    )
    if (second === undefined) {
        throw new Error('Expected the second grave skeleton')
    }
    expect(second.progression.masteries.undead.level).toBe(2)
    second.progression.constellations.opened.add('undead.imprint')
    expect(second.maxHp).toBe(50)
})

it('insets an edge grave while preserving the corpse, possessions and delayed birth at finalization', () => {
    const f = roomLifeFixture()
    const deathPosition = { x: 168, y: 8 }
    const item = createItemInstance('herbs', 4)
    const weapon = createItemInstance('simple_sword')
    f.hero.position = { ...deathPosition }
    f.hero.inventory.push(item)
    f.hero.equipment.weapon = weapon
    f.hero.applyDamage(f.hero.hp, now)
    const inventory = f.world.get(f.hero.locationId).inventory

    f.advance(now + 60_000)
    expect(f.life.graves(f.hero.locationId)).toMatchObject([
        {
            id: `final:${f.hero.id}`,
            position: { x: 168, y: 40 },
        },
    ])
    const corpse = inventory
        .snapshotChests()
        .find((chest) => chest.kind === 'corpse')
    expect(corpse).toMatchObject({
        id: `corpse:${f.hero.id}:1`,
        itemCount: 2,
        position: deathPosition,
    })
    expect(f.hero.position).toEqual(deathPosition)
    expect(f.life.abandon(f.hero, now + 60_001)).toBe(false)
    f.advance(now + 89_999)
    expect(f.characters.size).toBe(0)
    f.advance(now + 90_000)
    f.advance(now + 90_001)
    expect(f.characters.size).toBe(1)
    expect([...f.characters.values()][0]).toMatchObject({
        archetype: 'skeleton',
        locationId: f.hero.locationId,
    })
    expect(f.life.graves(f.hero.locationId)).toHaveLength(1)
    expect(
        f.events.filter((event) => event.kind === 'permadeath')
    ).toHaveLength(1)
    expect(
        inventory.snapshotChests().filter((chest) => chest.kind === 'corpse')
    ).toEqual([corpse])

    const viewer = new GameCharacter({
        id: 'edge-viewer',
        nickname: 'edge-viewer',
        archetype: 'human',
        controllerKind: 'network_player',
        locationId: f.hero.locationId,
        spawnPosition: deathPosition,
    })
    inventory.openChestById(viewer, `corpse:${f.hero.id}:1`, now + 90_002)
    inventory.containers.handle(
        viewer,
        { type: 'take_all_chest_items', chestId: `corpse:${f.hero.id}:1` },
        now + 90_003
    )
    expect(viewer.inventory).toEqual([item, weapon])
    expect(f.gold.get(viewer.id)).toBe(37)
})

describe('revival and finalization validation', () => {
    it('successful revival preserves identity and never creates a grave or delayed skeleton', () => {
        const f = roomLifeFixture()
        const caster = new GameCharacter({
            id: 'cleric',
            nickname: 'cleric',
            archetype: 'human',
            heroClass: 'cleric',
            controllerKind: 'network_player',
            locationId: f.hero.locationId,
            spawnPosition: { x: 152, y: 168 },
        })
        f.characters.set(caster.id, caster)
        f.hero.applyDamage(f.hero.hp, now)
        expect(
            beginRevive(
                caster,
                f.hero,
                now + 1_000,
                f.context(caster, now + 1_000)
            )
        ).toBe(true)
        f.advance(now + 4_000)
        expect(f.hero.alive).toBe(true)
        f.advance(now + 100_000)
        expect(f.characters.size).toBe(2)
        expect(f.life.graves(f.hero.locationId)).toEqual([])
        expect(f.gold.get(f.hero.id)).toBe(37)
    })

    it('rejects offline and foreign character objects and records an empty city corpse position as a grave', () => {
        const f = roomLifeFixture()
        f.hero.locationId = CENTER_LOCATION_ID
        f.hero.applyDamage(f.hero.hp, now)
        f.hero.tags.add('offline')
        expect(f.life.abandon(f.hero, now + 1)).toBe(false)
        f.hero.tags.delete('offline')
        const impostor = new GameCharacter({
            id: f.hero.id,
            nickname: f.hero.nickname,
            archetype: 'human',
            controllerKind: 'network_player',
            spawnPosition: f.hero.position,
        })
        impostor.applyDamage(impostor.hp, now)
        expect(f.life.abandon(impostor, now + 1)).toBe(false)
        f.gold.set(f.hero.id, 0)
        expect(f.life.abandon(f.hero, now + 1)).toBe(true)
        expect(f.life.graves(CENTER_LOCATION_ID)).toHaveLength(1)
        expect(
            f.world
                .get(CENTER_LOCATION_ID)
                .inventory.snapshotChests()
                .some((chest) => chest.kind === 'corpse')
        ).toBe(false)
        const snapshot = f.life.graves(CENTER_LOCATION_ID)
        const grave = snapshot[0]
        if (grave !== undefined) {
            grave.position.x = -100
        }
        expect(f.life.graves(CENTER_LOCATION_ID)[0]?.position).toEqual(
            f.hero.position
        )
    })
})

describe('socket-authorized abandon life command', () => {
    it('accepts no supplied owner or target, ignores alive requests, and frees the old nickname on final death', () => {
        vi.stubGlobal('Bun', { env: {} })
        vi.spyOn(Date, 'now').mockReturnValue(now)
        expect(parseClientMessage('{"type":"abandon_life"}').message).toEqual({
            type: 'abandon_life',
        })
        expect(
            parseClientMessage('{"type":"abandon_life","targetId":"another"}')
                .message
        ).toBeUndefined()
        const room = new GameRoom(graveNavigation())
        const first = joinChestRoom(room, 'First')
        const second = joinChestRoom(room, 'Second')
        room.handleMessage(first.socket, '{"type":"abandon_life"}')
        expect(room.getCharacter(first.actor.id)?.alive).toBe(true)
        second.actor.applyDamage(second.actor.hp, now)
        room.handleMessage(
            first.socket,
            JSON.stringify({ type: 'abandon_life', ownerId: second.actor.id })
        )
        expect(room.getCharacter(second.actor.id)).toBe(second.actor)
        first.actor.applyDamage(first.actor.hp, now)
        room.handleMessage(first.socket, '{"type":"abandon_life"}')
        expect(first.sent).toContainEqual(
            expect.objectContaining({
                type: 'event',
                event: { kind: 'permadeath', actorId: first.actor.id },
            })
        )
        expect(room.getCharacter(first.actor.id)).toBeUndefined()
        room.handleMessage(first.socket, '{"type":"abandon_life"}')
        expect(
            first.sent.filter(
                (message) =>
                    message.type === 'event' &&
                    message.event.kind === 'permadeath'
            )
        ).toHaveLength(1)
        room.handleMessage(first.socket, '{"type":"join","nickname":"First"}')
        const inits = first.sent.filter(
            (message) => message.type === 'world_init'
        )
        expect(inits).toHaveLength(2)
        expect(inits[1]?.playerId).not.toBe(first.actor.id)
        expect(room.snapshot(now, CENTER_LOCATION_ID).graves).toHaveLength(1)
        expect(room.snapshot(now, 'map-3-2').graves).toEqual([])
    })
})

it('removes a slain grave child without reviving it or deleting either independent loot container', () => {
    const f = roomLifeFixture()
    f.hero.inventory.push(createItemInstance('boots'))
    f.hero.applyDamage(f.hero.hp, now)
    expect(f.life.abandon(f.hero, now + 1)).toBe(true)
    f.advance(now + 30_001)
    const skeleton = [...f.characters.values()][0]
    if (skeleton === undefined) {
        throw new Error('Expected grave skeleton')
    }
    skeleton.applyDamage(skeleton.hp, now + 31_000)
    skeleton.queueRespawn(now + 31_000, 15_000)
    const inventory = f.world.get(skeleton.locationId).inventory
    inventory.dropLootForDeaths(
        [{ kind: 'death', targetId: skeleton.id }],
        (id) => f.characters.get(id)
    )
    const corpses = inventory
        .snapshotChests()
        .filter((chest) => chest.kind === 'corpse')
    expect(corpses).toHaveLength(2)
    skeleton.tickTimedState(now + 46_000)
    expect(skeleton.alive).toBe(false)
    f.advance(now + 46_000)
    expect(f.characters.has(skeleton.id)).toBe(false)
    expect(f.controllers.has(skeleton.id)).toBe(false)
    expect(
        inventory.snapshotChests().filter((chest) => chest.kind === 'corpse')
    ).toEqual(corpses)
    expect(f.life.graves(f.hero.locationId)).toHaveLength(1)
    expect(f.characters.size).toBe(0)
})
