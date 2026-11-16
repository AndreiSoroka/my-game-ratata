import { afterEach, describe, expect, it, vi } from 'vitest'

import { retireCharacter } from '../src/game/characterLife'
import { restoreCharacter } from '../src/game/characterRecovery'
import { createItemInstance } from '../src/game/inventory'
import { parseClientMessage } from '../src/game/messages'
import { heartFixture, heartOtherHero } from './heartTestHelpers'

afterEach(() => {
    vi.restoreAllMocks()
})

describe('inventory-backed heart delivery quest', () => {
    it('cannot become ready or pay a reward from three credited kills alone', () => {
        const setup = heartFixture()
        setup.accept()
        for (let index = 0; index < 3; index += 1) {
            setup.kill(`uncollected-${String(index)}`)
        }
        expect(setup.snapshot()).toMatchObject({
            gold: 0,
            trophies: 0,
            quest: {
                kills: 3,
                status: 'active',
                requiredItemId: 'slime_heart',
            },
        })
        setup.service.interact(setup.actor, setup.mira.id, [setup.mira])
        setup.service.choose(setup.actor, 'turn_in_trophies', [setup.mira])
        expect(setup.snapshot().gold).toBe(0)
        expect(
            setup.inventory
                .snapshotChests()
                .filter((chest) => chest.kind === 'corpse')
        ).toHaveLength(3)
    })

    it('consumes exactly three owned hearts once while preserving the fourth heart and other items', () => {
        const setup = heartFixture()
        setup.accept()
        setup.bring(4)
        const food = createItemInstance('food')
        setup.actor.inventory.push(food)
        const original = [...setup.actor.inventory]
        expect(setup.snapshot()).toMatchObject({
            trophies: 4,
            quest: { status: 'ready' },
        })
        setup.service.interact(setup.actor, setup.mira.id, [setup.mira])
        setup.service.choose(setup.actor, 'turn_in_trophies', [setup.mira])
        expect(setup.actor.inventory).toEqual([original[3], food])
        expect(setup.snapshot()).toMatchObject({
            gold: 40,
            trophies: 1,
            quest: { status: 'completed' },
            wardRestored: false,
        })
        setup.service.choose(setup.actor, 'turn_in_trophies', [setup.mira])
        expect(setup.snapshot().gold).toBe(40)
        expect(setup.actor.inventory).toEqual([original[3], food])
        setup.service.choose(setup.actor, 'restore_ward', [setup.mira])
        expect(setup.snapshot().wardRestored).toBe(true)
    })

    it('accepts hearts gathered before the quest without granting retrospective kill credit', () => {
        const setup = heartFixture()
        setup.bring()
        expect(setup.snapshot()).toMatchObject({
            trophies: 3,
            quest: { kills: 0, status: 'available' },
        })
        setup.accept()
        expect(setup.snapshot().quest.status).toBe('ready')
        setup.service.choose(setup.actor, 'turn_in_trophies', [setup.mira])
        expect(setup.snapshot()).toMatchObject({
            gold: 40,
            trophies: 0,
            quest: { kills: 0, status: 'completed' },
        })
    })
})

describe('stale and forged delivery requests', () => {
    it.each(['drop', 'stash'] as const)(
        'revalidates actual ownership after a ready heart is %s-ped',
        (action) => {
            const setup = heartFixture()
            setup.accept()
            setup.bring()
            setup.actor.position = { x: 100, y: 100 }
            setup.service.interact(setup.actor, setup.mira.id, [setup.mira])
            const selected = setup.actor.inventory[0]
            if (selected === undefined) {
                throw new Error('Missing heart')
            }
            setup.inventory.applyInventoryAction(
                setup.actor,
                action,
                selected.instanceId
            )
            const before = [...setup.actor.inventory]
            expect(setup.snapshot()).toMatchObject({
                trophies: 2,
                quest: { status: 'active' },
            })
            expect(
                setup
                    .snapshot()
                    .dialogue?.choices.some(
                        (choice) => choice.id === 'turn_in_trophies'
                    )
            ).toBe(false)
            setup.service.choose(setup.actor, 'turn_in_trophies', [setup.mira])
            expect(setup.actor.inventory).toEqual(before)
            expect(setup.snapshot().gold).toBe(0)
        }
    )

    it('ignores claimed trophies and other actors’ bags in a forged turn-in command', () => {
        const setup = heartFixture()
        setup.accept()
        const other = heartOtherHero()
        other.inventory = Array.from({ length: 3 }, () =>
            createItemInstance('slime_heart')
        )
        const parsed = parseClientMessage(
            JSON.stringify({
                type: 'dialogue_choice',
                choiceId: 'turn_in_trophies',
                actorId: other.id,
                trophies: 3,
                items: other.inventory,
            })
        )
        if (parsed.message?.type !== 'dialogue_choice') {
            throw new Error('Missing dialogue command')
        }
        setup.service.handle(setup.actor, parsed.message, [setup.mira])
        expect(setup.snapshot()).toMatchObject({
            trophies: 0,
            gold: 0,
            quest: { status: 'active' },
        })
        expect(other.inventory).toHaveLength(3)
    })

    it.each([
        'far',
        'location',
        'dead',
        'offline',
        'stunned',
        'locked',
        'merchant',
    ] as const)(
        'keeps hearts and reward unchanged when the turn-in context is %s',
        (reason) => {
            const setup = heartFixture()
            setup.accept()
            setup.bring()
            setup.service.interact(setup.actor, setup.mira.id, [setup.mira])
            const before = [...setup.actor.inventory]
            if (reason === 'far') {
                setup.actor.position = { x: 300, y: 300 }
            }
            if (reason === 'location') {
                setup.actor.locationId = 'map-0-0'
            }
            if (reason === 'dead') {
                setup.actor.applyDamage(setup.actor.hp, setup.clock.now)
            }
            if (reason === 'offline') {
                setup.actor.tags.add('offline')
            }
            if (reason === 'stunned') {
                setup.actor.stunUntil = setup.clock.now + 1
            }
            if (reason === 'locked') {
                setup.actor.actionLockUntil = setup.clock.now + 1
            }
            if (reason === 'merchant') {
                Object.assign(setup.mira, { id: 'npc_merchant_1' })
                setup.service.interact(setup.actor, setup.mira.id, [setup.mira])
            }
            setup.service.choose(setup.actor, 'turn_in_trophies', [setup.mira])
            expect(setup.actor.inventory).toEqual(before)
            expect(setup.snapshot().gold).toBe(0)
        }
    )
})

describe('shared character delivery and identity', () => {
    it('uses the same quest and item transfer rules for a scripted NPC', () => {
        const setup = heartFixture('scripted')
        setup.accept()
        setup.bring()
        setup.service.interact(setup.actor, setup.mira.id, [setup.mira])
        setup.service.choose(setup.actor, 'turn_in_trophies', [setup.mira])
        expect(setup.snapshot()).toMatchObject({
            gold: 40,
            trophies: 0,
            quest: { status: 'completed' },
        })
        expect(setup.actor.inventory).toEqual([])
    })

    it('retains hearts during the resurrection window and loses them with the retired identity', () => {
        const setup = heartFixture()
        setup.accept()
        setup.bring()
        const hearts = [...setup.actor.inventory]
        setup.actor.applyDamage(setup.actor.hp, setup.clock.now)
        setup.service.observe(
            [{ kind: 'death', targetId: setup.actor.id }],
            () => setup.actor
        )
        expect(setup.actor.inventory).toEqual(hearts)
        restoreCharacter(setup.actor, setup.clock.now + 3_000, false)
        expect(setup.snapshot()).toMatchObject({
            trophies: 3,
            quest: { status: 'ready' },
        })
        setup.actor.applyDamage(setup.actor.hp, setup.clock.now + 5_000)
        const retired = retireCharacter(setup.actor)
        setup.service.observe([retired], () => setup.actor)
        expect(setup.actor.inventory).toEqual([])
        const next = heartOtherHero()
        expect(
            setup.service.snapshot(next.id, next.locationId, next)
        ).toMatchObject({
            trophies: 0,
            gold: 0,
            quest: { status: 'available' },
        })
    })

    it('derives private inventory progress without changing state or notice receipts on snapshot reads', () => {
        const setup = heartFixture()
        setup.accept()
        setup.bring()
        const first = setup.snapshot()
        const other = heartOtherHero()
        expect(
            setup.service.snapshot(
                setup.actor.id,
                setup.actor.locationId,
                other
            ).trophies
        ).toBe(0)
        expect(
            setup.service.snapshot(other.id, other.locationId, other).trophies
        ).toBe(0)
        for (let index = 0; index < 3; index += 1) {
            expect(setup.snapshot()).toEqual(first)
        }
        expect(setup.actor.inventory).toHaveLength(3)
        expect(setup.snapshot().gold).toBe(0)
    })
})
