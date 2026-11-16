import { INVENTORY_CAPACITY } from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { attemptAttack, resolvePendingAttackHit } from '../src/game/combat'
import { createItemInstance } from '../src/game/inventory'
import { heartFixture, slime } from './heartTestHelpers'

describe('real hostile slime hearts in shared corpse containers', () => {
    it('creates one private heart before quest acceptance and ignores repeated death events', () => {
        const setup = heartFixture()
        const { target, events } = setup.kill('first')
        const corpse = setup.inventory
            .snapshotChests()
            .find((item) => item.kind === 'corpse')
        if (corpse === undefined) {
            throw new Error('Expected corpse')
        }
        expect(corpse).toMatchObject({
            itemCount: 1,
            position: target.position,
        })
        expect(setup.inventory.snapshotItems()).toEqual([])
        expect(
            setup.inventory.containers.snapshot(setup.actor, setup.clock.now)
        ).toBeNull()
        expect(setup.actor.inventory).toEqual([])
        expect(setup.inventory.dropLootForDeaths(events, () => target)).toEqual(
            []
        )
        setup.inventory.openChestById(setup.actor, corpse.id, setup.clock.now)
        expect(
            setup.inventory.containers.snapshot(setup.actor, setup.clock.now)
                ?.items[0]?.itemId
        ).toBe('slime_heart')
        setup.collect()
        expect(setup.snapshot().trophies).toBe(1)
        expect(setup.snapshot().gold).toBe(0)
    })

    it('leaves the heart in the corpse when full and later transfers it normally', () => {
        const setup = heartFixture()
        setup.actor.inventory = Array.from({ length: INVENTORY_CAPACITY }, () =>
            createItemInstance('food')
        )
        setup.kill('full')
        setup.collect()
        expect(
            setup.inventory
                .snapshotChests()
                .filter((item) => item.kind === 'corpse')
        ).toHaveLength(1)
        expect(setup.snapshot().trophies).toBe(0)
        setup.actor.inventory.pop()
        setup.collect()
        expect(setup.snapshot().trophies).toBe(1)
        expect(
            setup.inventory
                .snapshotChests()
                .filter((item) => item.kind === 'corpse')
        ).toHaveLength(0)
    })

    it.each([
        'friendly',
        'network-player',
        'human-source',
        'living',
        'other-map',
        'fabricated-corpse',
    ] as const)('does not create a heart for %s', (reason) => {
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
        setup.inventory.dropLootForDeaths(
            [{ kind: 'death', targetId: target.id }],
            () => target
        )
        expect(
            setup.inventory
                .snapshotChests()
                .filter((item) => item.kind === 'corpse')
        ).toHaveLength(0)
    })
})

describe('renewable biological trophies and shared damage', () => {
    it('creates a new heart after a genuine respawn, while retaining the old independent corpse', () => {
        const setup = heartFixture()
        const { target, events } = setup.kill('respawning')
        target.tickTimedState(setup.clock.now + 15_000)
        expect(target.alive).toBe(true)
        expect(setup.inventory.dropLootForDeaths(events, () => target)).toEqual(
            []
        )
        setup.clock.now += 16_000
        target.applyDamage(target.hp, setup.clock.now)
        target.queueRespawn(setup.clock.now, 15_000)
        setup.inventory.dropLootForDeaths(events, () => target)
        const corpses = setup.inventory
            .snapshotChests()
            .filter((item) => item.kind === 'corpse')
        expect(corpses).toHaveLength(2)
        expect(new Set(corpses.map((corpse) => corpse.id)).size).toBe(2)
        setup.collect()
        expect(setup.snapshot().trophies).toBe(2)
    })

    it('creates a corpse from a resolved combat death and requires an ordinary take command', () => {
        const setup = heartFixture()
        const target = slime('combat')
        target.hp = 1
        setup.actor.facing = 'right'
        const random = vi.spyOn(Math, 'random').mockReturnValue(0.99)
        try {
            const context = {
                actor: setup.actor,
                targets: [target],
                now: setup.clock.now,
                tileSize: 16,
                respawnDelayMsFor: () => 15_000,
            }
            attemptAttack(context)
            const hitAt = setup.actor.pendingAttack?.hitAt
            if (hitAt === undefined) {
                throw new Error('Expected hit')
            }
            const events = resolvePendingAttackHit({ ...context, now: hitAt })
            expect(events.some((event) => event.kind === 'death')).toBe(true)
            setup.inventory.dropLootForDeaths(events, () => target)
            setup.clock.now += 5_000
            expect(setup.actor.inventory).toEqual([])
            setup.collect()
            expect(setup.actor.inventory[0]?.itemId).toBe('slime_heart')
        } finally {
            random.mockRestore()
        }
    })
})
