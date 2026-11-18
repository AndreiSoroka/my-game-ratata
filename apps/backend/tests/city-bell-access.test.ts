import {
    type AdventureClientMessage,
    CENTER_LOCATION_ID,
    itemRepairPrice,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { npcCityStoryContext } from '../src/ai/npcCityStoryContext'
import { createItemInstance } from '../src/game/inventory'
import { createWhisperObserver } from '../src/game/roomWhisperObserver'
import {
    attributeNpcSpeech,
    createSpeechEvent,
} from '../src/game/speechReceipts'
import { WhisperService } from '../src/game/whispers'
import { cityActor, cityBellFixture } from './cityBellFixture'

describe('city service authority', () => {
    it.each(['silent', 'prepared'] as const)(
        'blocks all commissioned services in %s, including stale client windows',
        (state) => {
            const f = cityBellFixture(state)
            const merchant = cityActor('npc_merchant_1', 'scripted')
            const smith = cityActor('npc_smith_1', 'scripted')
            f.actors.push(merchant, smith)
            const wallet = f.service.walletFor(f.actor.id)
            wallet.gold = 200
            const sword = createItemInstance('simple_sword')
            sword.durability = 1
            f.actor.inventory.push(sword, createItemInstance('wood'))
            f.service.interact(
                f.actor,
                merchant.id,
                f.actors,
                f.navigation,
                f.clock.now
            )
            expect(f.snapshot().dialogue?.tradeBlockedReason).toContain(
                'Колокол'
            )
            if (wallet.dialogue !== null) {
                wallet.dialogue.canTrade = true
            }
            const before = JSON.stringify({
                inventory: f.actor.inventory,
                gold: wallet.gold,
                stock: f.service.economy.snapshot(
                    CENTER_LOCATION_ID,
                    f.clock.now
                ),
            })
            const buy = f.service.economy
                .snapshot(CENTER_LOCATION_ID, f.clock.now)
                ?.rows.find((row) => row.itemId === 'food')?.buyPrice
            const sell = f.service.economy
                .snapshot(CENTER_LOCATION_ID, f.clock.now)
                ?.rows.find((row) => row.itemId === 'wood')?.sellPrice
            const commands: AdventureClientMessage[] = [
                {
                    type: 'market_trade',
                    npcId: merchant.id,
                    side: 'buy',
                    itemId: 'food',
                    quantity: 1,
                    expectedTotal: buy ?? 0,
                    requestId: 'buy',
                },
                {
                    type: 'market_trade',
                    npcId: merchant.id,
                    side: 'sell',
                    itemId: 'wood',
                    quantity: 1,
                    expectedTotal: sell ?? 0,
                    requestId: 'sell',
                },
                {
                    type: 'repair_items',
                    npcId: smith.id,
                    instanceIds: [sword.instanceId],
                    expectedTotal: itemRepairPrice(sword),
                    requestId: 'repair',
                },
                {
                    type: 'craft_order_place',
                    npcId: smith.id,
                    itemId: 'axe',
                    expectedTotal: 25,
                    requestId: 'place',
                },
                {
                    type: 'craft_order_claim',
                    npcId: smith.id,
                    orderId: 'old-world-order',
                    expectedRemaining: 12,
                    requestId: 'claim',
                },
                { type: 'trade', itemId: 'food' },
            ]
            for (const command of commands) {
                const result = f.service.handleResult(
                    f.actor,
                    command,
                    f.actors,
                    f.navigation,
                    f.clock.now
                )
                expect(result.accepted).toBe(false)
                expect(result.error).toContain('Колокол')
            }
            expect(
                JSON.stringify({
                    inventory: f.actor.inventory,
                    gold: wallet.gold,
                    stock: f.service.economy.snapshot(
                        CENTER_LOCATION_ID,
                        f.clock.now
                    ),
                })
            ).toBe(before)
            expect(
                f.service.economy.customerOrders.snapshot(f.actor.id)
            ).toEqual([])
        }
    )
})

describe('city service availability', () => {
    it('unlocks a fresh ordinary trade after physical activation, without changing the price or minting stock', () => {
        const f = cityBellFixture('prepared')
        const merchant = cityActor('npc_merchant_1', 'scripted')
        f.actors.push(merchant)
        const wallet = f.service.walletFor(f.actor.id)
        wallet.gold = 100
        const row = f.service.economy
            .snapshot(CENTER_LOCATION_ID, f.clock.now)
            ?.rows.find((entry) => entry.itemId === 'food')
        if (row?.buyPrice === null || row?.buyPrice === undefined) {
            throw new Error('No actual food offer')
        }
        const command = {
            type: 'market_trade' as const,
            npcId: merchant.id,
            side: 'buy' as const,
            itemId: 'food' as const,
            quantity: 1,
            expectedTotal: row.buyPrice,
            requestId: 'before',
        }
        expect(
            f.service.handleResult(
                f.actor,
                command,
                f.actors,
                f.navigation,
                f.clock.now
            ).accepted
        ).toBe(false)
        expect(f.ring().accepted).toBe(true)
        const result = f.service.handleResult(
            f.actor,
            { ...command, requestId: 'after' },
            f.actors,
            f.navigation,
            f.clock.now
        )
        expect(result.accepted).toBe(true)
        expect(f.snapshot().gold).toBe(100 - row.buyPrice)
        expect(f.actor.inventory.map((item) => item.itemId)).toEqual(['food'])
        expect(
            f.service.economy
                .snapshot(CENTER_LOCATION_ID, f.clock.now)
                ?.rows.find((entry) => entry.itemId === 'food')?.stock
        ).toBe(row.stock - 1)
    })

    it('leaves conversations, self-crafting, ordinary work and order cancellation available', () => {
        const f = cityBellFixture()
        const recipe = f.snapshot().recipes.find((entry) => entry.id === 'food')
        if (recipe === undefined) {
            throw new Error('Missing shared food recipe')
        }
        for (const [id, amount] of Object.entries(recipe.cost)) {
            f.actor.inventory.push(
                ...Array.from({ length: amount }, () =>
                    createItemInstance(id as 'herbs' | 'fiber')
                )
            )
        }
        const crafted = f.service.handleResult(
            f.actor,
            { type: 'craft', recipeId: 'food' },
            f.actors,
            f.navigation,
            f.clock.now
        )
        expect(crafted.accepted).toBe(true)
        expect(f.actor.inventory.map((item) => item.itemId)).toEqual(['food'])
        f.service.interact(
            f.actor,
            f.mira.id,
            f.actors,
            f.navigation,
            f.clock.now
        )
        expect(f.snapshot().dialogue?.npcId).toBe(f.mira.id)
        const smith = cityActor('npc_smith_1', 'scripted')
        const cancelled = f.service.handleResult(
            f.actor,
            {
                type: 'craft_order_cancel',
                npcId: smith.id,
                orderId: 'missing-order',
                requestId: 'cancel',
            },
            [...f.actors, smith],
            f.navigation,
            f.clock.now
        )
        expect(cancelled.error).not.toContain('Колокол')
        expect(f.snapshot().cityState?.bellState).toBe('silent')
    })
})

describe('Vera’s first conversation and current city facts', () => {
    it('selects one stable opening per identity, not per name, controller or context read', () => {
        const f = cityBellFixture()
        const vera = cityActor('npc_cleric_1', 'scripted')
        const selected = Array.from(
            { length: 100 },
            (_, index) => `new-person-${String(index)}`
        ).filter(
            (id) => f.service.cities.introduction(vera.id, id) !== undefined
        )
        expect(selected.length).toBeGreaterThan(25)
        expect(selected.length).toBeLessThan(75)
        const first = selected[0]
        const next = selected[1]
        if (first === undefined || next === undefined) {
            throw new Error('No chosen intro fixtures')
        }
        const world = { adventureForWorkers: () => f.service }
        const context = npcCityStoryContext(world, vera, first)
        expect(context.cityStory?.firstMeetingIntroduction).toContain(
            'оставленном теле'
        )
        expect(npcCityStoryContext(world, vera, first)).toEqual(context)
        const listener = cityActor(first)
        const find = (id: string) =>
            [vera, listener].find((person) => person.id === id)
        listener.position.x = 16
        f.service.observe(
            [
                attributeNpcSpeech(
                    createSpeechEvent(vera, 'Здравствуй. Я рядом.'),
                    first
                ),
            ],
            find,
            () => f.navigation
        )
        expect(npcCityStoryContext(world, vera, first)).toEqual(context)
        listener.position = { ...vera.position }
        f.service.observe(
            [
                createSpeechEvent(vera, 'Здравствуй. Я рядом.', {
                    targetId: first,
                }),
            ],
            find,
            () => f.navigation
        )
        expect(
            npcCityStoryContext(world, vera, first).cityStory
                ?.firstMeetingIntroduction
        ).toBeUndefined()
        expect(
            npcCityStoryContext(world, vera, next).cityStory
                ?.firstMeetingIntroduction
        ).toBeDefined()
        const otherGuide = cityActor('someone-else', 'scripted', vera.nickname)
        expect(
            npcCityStoryContext(world, otherGuide, next).cityStory
                ?.firstMeetingIntroduction
        ).toBeUndefined()
    })

    it('consumes the opening only after a delivered private reply, preserving unreachable identities', () => {
        const f = cityBellFixture()
        const vera = cityActor('npc_cleric_1', 'scripted')
        const id = Array.from(
            { length: 100 },
            (_, index) => `private-person-${String(index)}`
        ).find(
            (person) =>
                f.service.cities.introduction(vera.id, person) !== undefined
        )
        if (id === undefined) {
            throw new Error('No chosen intro fixture')
        }
        const listener = cityActor(id)
        const actors = new Map([
            [vera.id, vera],
            [listener.id, listener],
        ])
        const whispers = new WhisperService({
            getCharacter: (who) => actors.get(who),
            navigationFor: () => f.navigation,
            heard: createWhisperObserver(
                () => undefined,
                () => ({ heard: () => undefined }) as never,
                (speaker, target) =>
                    f.service.cities.observeSpeech(speaker.id, target.id)
            ),
        })
        listener.position.x = 16
        expect(whispers.send(vera, listener, 'Я рядом.', f.clock.now)).toBe(
            false
        )
        expect(
            f.service.cities.introduction(vera.id, listener.id)
        ).toBeDefined()
        listener.position = { ...vera.position }
        expect(whispers.send(vera, listener, 'Я рядом.', f.clock.now)).toBe(
            true
        )
        expect(
            f.service.cities.introduction(vera.id, listener.id)
        ).toBeUndefined()
    })
})

describe('Vera’s authoritative current city facts', () => {
    it.each(['silent', 'prepared', 'active'] as const)(
        'supplies current %s facts independent of old narrative memory',
        (state) => {
            const f = cityBellFixture(state)
            const vera = cityActor('npc_cleric_1', 'scripted')
            const context = npcCityStoryContext(
                { adventureForWorkers: () => f.service },
                vera,
                f.actor.id
            )
            expect(context.cityStory?.current.bellState).toBe(state)
            const expected = {
                silent: 'Мире',
                prepared: 'внутри часовни',
                active: 'работают',
            }[state]
            expect(context.cityStory?.guidance).toContain(expected)
            expect(context.cityStory?.authoredQuests).toBeUndefined()
        }
    )
})
