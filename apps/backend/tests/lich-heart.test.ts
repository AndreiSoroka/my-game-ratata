import {
    CHEST_CAPACITY,
    masteryTotalExperience,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { beginRevive } from '../src/game/characterLife'
import { syncAbilityConstellations } from '../src/game/constellations'
import { createItemInstance } from '../src/game/inventory'
import { required } from './containerTestHelpers'
import { graveHero, roomLifeFixture } from './graveTestHelpers'

const now = 10_000

function prepare(level = 9) {
    const fixture = roomLifeFixture()
    const { hero, world } = fixture
    hero.progression.masteries.prayer_grave.level = level
    hero.progression.masteries.life.level = 4
    hero.abilities.known.add('pray_grave')
    syncAbilityConstellations(hero)
    const inventory = world.get(hero.locationId).inventory
    const chest = inventory.containers.ritualChest('chest_forest_1')
    if (chest === undefined) {
        throw new Error('Missing fixture chest')
    }
    hero.position = { x: chest.position.x + 16, y: chest.position.y }
    return { ...fixture, chest, inventory }
}

it('binds at level nine and returns the same lich exactly once with seventy percent of each mastery', () => {
    const novice = prepare(8)
    novice.life.useHeart(
        novice.hero,
        novice.chest.id,
        novice.context(novice.hero, now)
    )
    expect(novice.hero.lichHeartBound).toBe(false)

    const f = prepare()
    const { hero, chest, inventory } = f
    const item = createItemInstance('herbs')
    hero.inventory.push(item)
    f.life.useHeart(hero, chest.id, f.context(hero, now))
    const heart = chest.contents.find(({ itemId }) => itemId === 'lich_heart')
    expect(heart).toBeDefined()
    hero.applyDamage(hero.hp, now)
    f.advance(now + 1)
    expect(hero.snapshot(now + 1).life).toMatchObject({
        reviveMsLeft: 59_999,
        lichReturnMsLeft: 599_999,
    })
    f.advance(now + 60_000)
    expect(f.characters.get(hero.id)).toBe(hero)
    expect(hero.inventory).toEqual([])
    expect(hero.snapshot(now + 60_000).life?.retired).toBe(false)
    const bodyId = `corpse:${hero.id}:1`
    expect(
        inventory.deathLoot.raisableRemains(bodyId, now + 60_000)
    ).toBeUndefined()
    expect(
        inventory.snapshotChests().find(({ id }) => id === bodyId)?.itemCount
    ).toBe(1)
    f.advance(now + 599_999)
    expect(hero.alive).toBe(false)
    f.advance(now + 600_000)
    f.advance(now + 600_001)
    expect(f.characters.get(hero.id)).toBe(hero)
    expect(f.connections.get(f.socket)).toBe(hero.id)
    expect(hero).toMatchObject({
        alive: true,
        creatureType: 'undead',
        lich: true,
        lichHeartBound: false,
    })
    expect(chest.contents).not.toContain(heart)
    for (const [path, before] of [
        ['prayer_grave', 9],
        ['life', 4],
    ] as const) {
        const { level, experience } = hero.progression.masteries[path]
        expect(masteryTotalExperience(level) + experience).toBe(
            (masteryTotalExperience(before) * 7n) / 10n
        )
    }
    expect(
        f.events.filter(({ abilityId }) => abilityId === 'ash_heart')
    ).toHaveLength(1)
})

it('needs a free chest slot to bind a heart and leaves no binding after a refusal', () => {
    const { hero, chest, inventory, life, context } = prepare()
    chest.contents = Array.from({ length: CHEST_CAPACITY }, () =>
        createItemInstance('wood')
    )
    const before = [...chest.contents]
    expect(life.useHeart(hero, chest.id, context(hero, now))).toEqual([
        {
            kind: 'notice',
            actorId: hero.id,
            audienceIds: [hero.id],
            text: 'В сундуке нет места.',
        },
    ])
    expect(chest.contents).toEqual(before)
    expect(hero.lichHeartBound).toBe(false)
    expect(hero.lichReturnAt).toBeUndefined()

    inventory.openChestById(hero, chest.id, now)
    expect(
        inventory.containers.handle(
            hero,
            {
                type: 'take_chest_item',
                chestId: chest.id,
                itemInstanceId: required(before[0]).instanceId,
            },
            now
        )[0]?.kind
    ).toBe('item_pickup')
    life.useHeart(hero, chest.id, context(hero, now))
    expect(hero.lichHeartBound).toBe(true)
    expect(chest.contents).toHaveLength(CHEST_CAPACITY)
    expect(chest.contents.at(-1)?.itemId).toBe('lich_heart')
})

it('breaks the seal when the exact heart is taken and put back before the next tick', () => {
    const f = prepare()
    f.life.useHeart(f.hero, f.chest.id, f.context(f.hero, now))
    const heart = f.chest.contents.find(({ itemId }) => itemId === 'lich_heart')
    if (heart === undefined) {
        throw new Error('Failed to bind fixture heart')
    }
    const looter = graveHero('looter')
    looter.position = { ...f.hero.position }
    f.hero.applyDamage(f.hero.hp, now)
    f.advance(now + 60_000)
    f.inventory.openChestById(looter, f.chest.id, now + 61_000)
    f.inventory.containers.handle(
        looter,
        {
            type: 'take_chest_item',
            chestId: f.chest.id,
            itemInstanceId: heart.instanceId,
        },
        now + 61_001
    )
    f.inventory.containers.handle(
        looter,
        {
            type: 'put_chest_item',
            chestId: f.chest.id,
            itemInstanceId: heart.instanceId,
        },
        now + 61_002
    )
    expect(
        f.chest.contents.some(
            ({ instanceId }) => instanceId === heart.instanceId
        )
    ).toBe(true)
    expect(f.hero.lichHeartBound).toBe(false)
    f.advance(now + 600_000)
    expect(f.characters.has(f.hero.id)).toBe(false)
    expect(f.events.filter(({ kind }) => kind === 'permadeath')).toHaveLength(1)
})

it('cancels a scheduled return when a cleric revives the character during the soul window', () => {
    const f = prepare()
    const caster = graveHero('cleric')
    caster.abilities.known.add('pray')
    caster.progression.masteries.prayer.level = 5
    syncAbilityConstellations(caster)
    caster.position = { x: f.hero.position.x + 16, y: f.hero.position.y }
    f.characters.set(caster.id, caster)
    f.life.useHeart(f.hero, f.chest.id, f.context(f.hero, now))
    f.hero.applyDamage(f.hero.hp, now)
    f.advance(now + 1)
    expect(
        beginRevive(caster, f.hero, now + 2, f.context(caster, now + 2))
    ).toBe(true)
    f.advance(now + 3_100)
    f.advance(now + 600_000)
    expect(f.hero).toMatchObject({
        alive: true,
        lich: false,
        lichHeartBound: true,
    })
    expect(f.hero.progression.masteries.prayer_grave.level).toBe(9)
})
