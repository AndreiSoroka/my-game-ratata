import { INVENTORY_CAPACITY } from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { attemptAttack, resolvePendingAttackHit } from '../src/game/combat'
import { createItemInstance } from '../src/game/inventory'
import { heartFixture, heartOtherHero, slime } from './heartTestHelpers'

afterEach(() => {
    vi.restoreAllMocks()
})

describe('real hostile slime heart drops', () => {
    it('drops one real heart before accepting a quest and does not auto-pick it up', () => {
        const setup = heartFixture()
        const { target, events, loot } = setup.kill('first')
        expect(loot).toEqual([
            {
                kind: 'item_drop',
                itemId: 'slime_heart',
                actorId: setup.actor.id,
                targetId: target.id,
            },
        ])
        expect(setup.actor.inventory).toEqual([])
        expect(setup.snapshot()).toMatchObject({
            trophies: 0,
            gold: 0,
            quest: { status: 'available', kills: 0 },
        })
        const items = setup.inventory.snapshotItems()
        expect(items).toHaveLength(1)
        expect(items[0]?.itemId).toBe('slime_heart')
        const other = heartOtherHero()
        const find = (id: string) =>
            [target, setup.actor, other].find((actor) => actor.id === id)
        expect(
            setup.inventory.dropLootForDeaths(
                [
                    ...events,
                    {
                        ...events[0],
                        actorId: other.id,
                        kind: 'death',
                        targetId: target.id,
                    },
                ],
                find
            )
        ).toEqual([])
        expect(setup.inventory.snapshotItems()).toEqual(items)
    })

    it('keeps a heart on the ground when the bag is full and permits a later ordinary pickup', () => {
        const setup = heartFixture()
        setup.actor.inventory = Array.from({ length: INVENTORY_CAPACITY }, () =>
            createItemInstance('food')
        )
        setup.kill('full-bag')
        setup.collect()
        expect(setup.inventory.snapshotItems()).toHaveLength(1)
        expect(setup.snapshot().trophies).toBe(0)
        setup.actor.inventory.pop()
        setup.collect()
        expect(setup.inventory.snapshotItems()).toEqual([])
        expect(setup.actor.inventory.at(-1)?.itemId).toBe('slime_heart')
        expect(setup.snapshot().trophies).toBe(1)
    })

    it('drops beside the corpse on a walkable tile when the normal drop offset hits a wall', () => {
        const setup = heartFixture()
        setup.navigation.grid.solid[7 * 20 + 7] = true
        const { target } = setup.kill('near-wall')
        const item = setup.inventory.snapshotItems()[0]
        expect(item?.position).toEqual(target.position)
        if (item === undefined) {
            throw new Error('Missing heart')
        }
        expect(
            setup.navigation.isSolidTile(
                setup.navigation.worldToTile(item.position)
            )
        ).toBe(false)
        setup.collect()
        expect(setup.snapshot().trophies).toBe(1)
    })
})

describe('heart farming exclusions and life-cycle deduplication', () => {
    it.each([
        'friendly',
        'network-player',
        'human-source',
        'living',
        'other-map',
        'fabricated-corpse',
    ] as const)('does not create hearts for %s targets', (reason) => {
        const setup = heartFixture()
        const target = slime(
            'excluded',
            reason === 'network-player' ? 'network_player' : 'mob1'
        )
        if (reason !== 'living') {
            target.applyDamage(target.hp, setup.clock.now)
        }
        if (reason === 'friendly') {
            Object.assign(target, { faction: 'peaceful' })
        }
        if (reason === 'human-source') {
            target.soul.controlSource = 'human'
        }
        if (reason === 'other-map') {
            target.locationId = 'map-0-0'
        }
        if (reason === 'fabricated-corpse') {
            target.deathSequence = 0
        }
        const events = [
            { kind: 'death', actorId: setup.actor.id, targetId: target.id },
        ] as const
        expect(
            setup.inventory.dropLootForDeaths([...events], () => target)
        ).toEqual([])
        expect(setup.inventory.snapshotItems()).toEqual([])
    })

    it('allows another drop only after a real respawn and a new shared damage death', () => {
        const setup = heartFixture()
        setup.accept()
        const { target, events } = setup.kill('respawning')
        expect(target.deathSequence).toBe(1)
        target.applyDamage(10, setup.clock.now + 1)
        expect(target.deathSequence).toBe(1)
        const find = (id: string) =>
            [target, setup.actor].find((actor) => actor.id === id)
        expect(setup.inventory.dropLootForDeaths(events, find)).toEqual([])
        target.tickTimedState(setup.clock.now + 15_000)
        expect(target.alive).toBe(true)
        expect(setup.inventory.dropLootForDeaths(events, find)).toEqual([])
        setup.clock.now += 16_000
        target.applyDamage(target.hp, setup.clock.now)
        target.queueRespawn(setup.clock.now, 15_000)
        expect(target.deathSequence).toBe(2)
        expect(setup.inventory.dropLootForDeaths(events, find)).toHaveLength(1)
        setup.service.observe(events, find)
        setup.service.observe(events, find)
        expect(setup.snapshot().quest.kills).toBe(2)
        expect(setup.inventory.snapshotItems()).toHaveLength(2)
        expect(Object.keys(target.snapshot(setup.clock.now))).not.toContain(
            'deathSequence'
        )
    })

    it('does not reroll old skeleton loot on death-event replay', () => {
        const setup = heartFixture()
        const target = slime('skeleton')
        Object.assign(target, { archetype: 'skeleton' })
        target.applyDamage(target.hp, setup.clock.now)
        const events = [
            { kind: 'death', actorId: setup.actor.id, targetId: target.id },
        ] as const
        const random = vi.spyOn(Math, 'random').mockReturnValue(0.99)
        expect(
            setup.inventory.dropLootForDeaths([...events], () => target)
        ).toEqual([])
        random.mockReturnValue(0)
        expect(
            setup.inventory.dropLootForDeaths([...events], () => target)
        ).toEqual([])
        expect(setup.inventory.snapshotItems()).toEqual([])
    })
})

describe('shared combat to ordinary loot pipeline', () => {
    it('produces a pickupable heart from a real resolved hit rather than kill-counter credit', () => {
        const setup = heartFixture()
        setup.accept()
        const target = slime('combat-target')
        target.hp = 1
        setup.actor.facing = 'right'
        vi.spyOn(Math, 'random').mockReturnValue(0.99)
        const context = {
            actor: setup.actor,
            targets: [target],
            now: setup.clock.now,
            tileSize: 16,
            respawnDelayMsFor: () => 15_000,
        }
        expect(attemptAttack(context)[0]?.kind).toBe('attack')
        const hitAt = setup.actor.pendingAttack?.hitAt
        if (hitAt === undefined) {
            throw new Error('Missing shared attack windup')
        }
        const events = resolvePendingAttackHit({ ...context, now: hitAt })
        expect(events.some((event) => event.kind === 'death')).toBe(true)
        const find = (id: string) =>
            [setup.actor, target].find((actor) => actor.id === id)
        setup.inventory.dropLootForDeaths(events, find)
        setup.service.observe(events, find)
        expect(setup.snapshot()).toMatchObject({
            trophies: 0,
            quest: { kills: 1, status: 'active' },
        })
        setup.clock.now += 5_000
        setup.collect()
        expect(setup.actor.inventory[0]?.itemId).toBe('slime_heart')
        expect(setup.snapshot().trophies).toBe(1)
    })
})
