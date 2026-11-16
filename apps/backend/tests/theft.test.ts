import { parseMasteryExperience } from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createItemInstance, inventoryCapacity } from '../src/game/inventory'
import { parseClientMessage } from '../src/game/messages'
import { seedNpcPockets } from '../src/game/npcPockets'
import { theftCharacter, theftFixture } from './theftFixtures'

afterEach(() => vi.restoreAllMocks())

describe('atomic real-item theft', () => {
    it('moves one existing unequipped instance, charges labor and practices only meaningful actions', () => {
        const { actor, victim, service, attempt } = theftFixture()
        const item = victim.inventory[0]
        const equipped = createItemInstance('simple_sword')
        victim.equipment.weapon = equipped
        victim.inventory.unshift(equipped)
        const events = attempt()
        expect(actor.inventory).toEqual([item])
        expect(victim.inventory).toEqual([equipped])
        expect(victim.equipment.weapon).toBe(equipped)
        expect(actor.energy).toBe(actor.config.resources.maxEnergy - 10)
        expect(actor.progression.masteries.shadow.experience).toBe(
            parseMasteryExperience('70')
        )
        expect(service.snapshot(actor.id, actor.id, 1_000)).toMatchObject({
            cooldownMsLeft: 8_000,
            lastResult: {
                outcome: 'stolen',
                itemId: 'food',
                targetId: victim.id,
            },
        })
        expect(
            events.every(
                (event) => event.audienceIds?.includes(actor.id) === true
            )
        ).toBe(true)
        expect(
            events.some(
                (event) => event.audienceIds?.includes(victim.id) === true
            )
        ).toBe(false)
    })
    it('prevents replay and same-target practice farming even after the global cooldown expires', () => {
        const { actor, victim, service, attempt } = theftFixture()
        victim.inventory.push(createItemInstance('boots'))
        attempt()
        attempt([0.99, 0], 1_001)
        attempt([0.99, 0], 9_000)
        attempt([0.99, 0], 60_999)
        expect(actor.inventory).toHaveLength(1)
        expect(actor.energy).toBe(actor.config.resources.maxEnergy - 10)
        expect(actor.progression.masteries.shadow.experience).toBe(
            parseMasteryExperience('70')
        )
        attempt([0.99, 0], 61_000)
        expect(actor.inventory).toHaveLength(2)
        expect(actor.energy).toBe(actor.config.resources.maxEnergy - 20)
        expect(
            service.snapshot(actor.id, actor.id, 61_000).lastResult?.itemId
        ).toBe('boots')
    })
    it('does not duplicate a last pocket item when two thieves race and does not charge the empty attempt', () => {
        const { actor, victim, service, attempt, navigation, characters } =
            theftFixture()
        const second = theftCharacter('second')
        second.movement.mode = 'sneaking'
        characters.push(second)
        const original = victim.inventory[0]
        attempt()
        service.handle(
            second,
            { type: 'steal', targetId: victim.id },
            { characters, navigation, now: 1_000, random: () => 0.99 }
        )
        expect(actor.inventory).toEqual([original])
        expect(second.inventory).toEqual([])
        expect(victim.inventory).toEqual([])
        expect(second.energy).toBe(second.config.resources.maxEnergy)
        expect(second.progression.masteries.shadow.experience).toBe(0n)
        expect(
            service.snapshot(second.id, second.id, 1_000).cooldownMsLeft
        ).toBe(0)
    })
    it('charges a valid unnoticed failure but reveals no item and grants no stealth practice', () => {
        const { actor, victim, service, attempt } = theftFixture()
        const events = attempt([0.99, 0.99])
        expect(actor.inventory).toEqual([])
        expect(victim.inventory).toHaveLength(1)
        expect(actor.energy).toBe(actor.config.resources.maxEnergy - 10)
        expect(actor.progression.masteries.shadow.experience).toBe(0n)
        expect(
            service.snapshot(actor.id, actor.id, 1_000).lastResult
        ).toMatchObject({ outcome: 'failed' })
        expect(
            service.snapshot(actor.id, actor.id, 1_000).lastResult?.itemId
        ).toBeUndefined()
        expect(
            events.every(
                (event) =>
                    event.audienceIds?.length === 1 &&
                    event.audienceIds[0] === actor.id
            )
        ).toBe(true)
    })
})

describe('resolved theft transfer', () => {
    it('grants no mastery or success claim if the selected real item disappears before transfer', () => {
        const { actor, victim, service, navigation, characters } =
            theftFixture()
        let roll = 0
        service.handle(
            actor,
            { type: 'steal', targetId: victim.id },
            {
                characters,
                navigation,
                now: 1000,
                random: () => {
                    victim.inventory = []
                    return roll++ === 0 ? 0.99 : 0
                },
            }
        )
        expect(actor.inventory).toEqual([])
        expect(actor.progression.masteries.shadow.experience).toBe(0n)
        expect(
            service.snapshot(actor.id, actor.id, 1000).lastResult?.outcome
        ).toBe('failed')
    })
})

describe('authored finite NPC pockets', () => {
    it('seeds finite NPC pockets once and never creates items while inspecting or respawning', () => {
        const npc = theftCharacter(
            'npc_merchant_1',
            { x: 100, y: 100 },
            'scripted'
        )
        seedNpcPockets([npc])
        expect(npc.inventory.map((item) => item.itemId)).toEqual([
            'food',
            'simple_sword',
        ])
        const ids = npc.inventory.map((item) => item.instanceId)
        seedNpcPockets([npc])
        expect(npc.inventory.map((item) => item.instanceId)).toEqual(ids)
        npc.inventory = []
        npc.applyDamage(npc.hp, 1_000)
        npc.queueRespawn(1_000, 100)
        npc.tickTimedState(1_100)
        seedNpcPockets([npc])
        expect(npc.inventory).toEqual([])
        const human = theftCharacter('npc_merchant_1')
        seedNpcPockets([human])
        expect(human.inventory).toEqual([])
    })
})

describe('theft authority and invalid attempts', () => {
    it.each([
        'dead thief',
        'dead target',
        'offline thief',
        'offline target',
        'far',
        'other map',
        'walking',
        'dash',
        'stun',
        'lock',
        'empty',
        'full',
        'energy',
        'wall',
    ] as const)(
        'rejects %s without spending resources, granting practice or transferring items',
        (reason) => {
            const { actor, victim, navigation, service } = theftFixture()
            if (reason === 'dead thief') {
                actor.alive = false
            }
            if (reason === 'dead target') {
                victim.alive = false
            }
            if (reason === 'offline thief') {
                actor.tags.add('offline')
            }
            if (reason === 'offline target') {
                victim.tags.add('offline')
            }
            if (reason === 'far') {
                victim.position.x = 129
            }
            if (reason === 'other map') {
                victim.locationId = 'map-0-0'
            }
            if (reason === 'walking') {
                actor.movement.mode = 'walking'
            }
            if (reason === 'dash') {
                actor.movement.dashUntil = 1_100
            }
            if (reason === 'stun') {
                actor.stunUntil = 1_100
            }
            if (reason === 'lock') {
                actor.lockAction(1_000, 100)
            }
            if (reason === 'empty') {
                victim.inventory = []
            }
            if (reason === 'full') {
                actor.inventory = Array.from(
                    { length: inventoryCapacity },
                    () => createItemInstance('food')
                )
            }
            if (reason === 'energy') {
                actor.energy = 9
            }
            if (reason === 'wall') {
                navigation.grid.solid[6 * 30 + 7] = true
            }
            const before = {
                energy: actor.energy,
                thief: [...actor.inventory],
                victim: [...victim.inventory],
            }
            const random = vi.fn(() => 0)
            service.handle(
                actor,
                { type: 'steal', targetId: victim.id },
                { characters: [actor, victim], navigation, now: 1_000, random }
            )
            expect(random).not.toHaveBeenCalled()
            expect(actor.inventory).toEqual(before.thief)
            expect(victim.inventory).toEqual(before.victim)
            expect(actor.energy).toBe(before.energy)
            expect(actor.progression.masteries.shadow.experience).toBe(0n)
            expect(
                service.snapshot(actor.id, actor.id, 1_000).cooldownMsLeft
            ).toBe(0)
        }
    )
    it('accepts a validated target ID only, stripping fabricated rewards, owner and success fields', () => {
        for (const type of [
            'steal',
            'call_guards',
            'report_theft',
            'absolve',
        ]) {
            expect(
                parseClientMessage(
                    JSON.stringify({
                        type,
                        targetId: 'victim',
                        actorId: 'someone',
                        itemId: 'simple_sword',
                        detected: false,
                        success: true,
                    })
                ).message
            ).toEqual({ type, targetId: 'victim' })
            for (const targetId of ['', 3, null, 'x'.repeat(101)]) {
                expect(
                    parseClientMessage(JSON.stringify({ type, targetId })).error
                ).toBeDefined()
            }
        }
    })
})
