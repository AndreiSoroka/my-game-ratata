import {
    type AdventureSnapshot,
    type ClientMessage,
    HERBALIST_MERCHANT_ID,
    quoteMarketTrade,
} from '@my-game-ratata/contracts'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { characterFixture, worldFixture } from '@/game/testing/characterFixture'

import { marketWindowContext } from '../model/marketWindowContext'
import AdventureDialogue from './AdventureDialogue.vue'
import SpeechBubbles from './SpeechBubbles.vue'

const adventure: AdventureSnapshot = {
    dialogue: {
        npcId: 'merchant',
        npcName: 'Савва',
        title: 'Разговор',
        text: 'Добро пожаловать.',
        canTrade: true,
        choices: [
            { id: 'trade', label: 'Покажи товары' },
            { id: 'leave', label: 'До встречи' },
        ],
    },
    gold: 10,
    notice: null,
    farmPlots: [],
    resourceNodes: [],
    recipes: [],
    trophies: 0,
    wardRestored: false,
    materials: {
        grain: 3,
        herbs: 0,
        wood: 0,
        fiber: 0,
        scrap: 0,
        stone: 0,
        brushwood: 0,
        sapling: 0,
    },
    quest: {
        id: 'quest',
        title: 'Три слизневых сердца',
        description: 'Принесите три сердца, чтобы восстановить защиту города.',
        goal: 3,
        requiredItemId: 'slime_heart',
        kills: 0,
        status: 'available',
        rewardGold: 40,
    },
    shop: [
        { itemId: 'food', label: 'Еда', price: 4 },
        { itemId: 'boots', label: 'Сапоги', price: 18 },
    ],
}

const neighborKey = 'character:ally'
const neighbors = { right: { key: neighborKey, name: 'Лада' } }

it('keeps city services accessible when a dialogue snapshot contains old quest choices', async () => {
    const dialogue = {
        ...adventure.dialogue!,
        npcId: 'npc_friendly_girl_1',
        choices: [
            { id: 'accept_quest', label: 'Взять задание' },
            { id: 'quest_progress', label: 'Напомнить задание' },
            { id: 'turn_in_trophies', label: 'Сдать сердца' },
            { id: 'worker-contract:some-id', label: 'Обращение работника' },
            { id: 'city_report', label: 'Спрос и запасы' },
        ],
    }
    const wrapper = mount(AdventureDialogue, {
        props: { adventure: { ...adventure, dialogue }, characters: [] },
    })
    try {
        expect(wrapper.findAll('[data-dialogue-action]').map((action) => action.text())).toEqual([
            'Спрос и запасы',
        ])
        await wrapper.get('[data-dialogue-action="city_report"]').trigger('click')
        expect(wrapper.emitted('command')).toEqual([
            [{ type: 'dialogue_choice', choiceId: 'city_report' }],
        ])
    } finally {
        wrapper.unmount()
    }
})

it('reopens the same service only on a fresh offer', async () => {
    const offer = { ...adventure.dialogue!, initialView: 'shop' as const, speechId: 1 }
    const wrapper = mount(AdventureDialogue, {
        props: { adventure: { ...adventure, dialogue: offer }, characters: [] },
    })
    try {
        const shop = '[aria-label="Торговля"]'
        const back = '.social-window-stack--shop footer button'
        expect(wrapper.find(shop).exists()).toBe(true)
        await wrapper.get(back).trigger('click')
        await wrapper.setProps({ adventure: { ...adventure, dialogue: { ...offer } } })
        expect(wrapper.find(shop).exists()).toBe(false)
        await wrapper.setProps({
            adventure: { ...adventure, dialogue: { ...offer, speechId: 2 } },
        })
        expect(wrapper.find(shop).exists()).toBe(true)
    } finally {
        wrapper.unmount()
    }
})

it('opens a fresh market offer on the selling side and returns to its private conversation', async () => {
    const dialogue = { ...adventure.dialogue!, npcId: HERBALIST_MERCHANT_ID }
    const offeredTrade: AdventureSnapshot = {
        ...adventure,
        dialogue: { ...dialogue, initialView: 'shop', initialMarketSide: 'sell', speechId: 8 },
        market: { cityId: 'city', cityName: 'Новогород', revision: 1, rows: [] },
    }
    const context = { shopOpen: ref(false), whisperPartnerId: ref(HERBALIST_MERCHANT_ID as string) }
    const wrapper = mount(AdventureDialogue, {
        attachTo: document.body,
        props: { adventure: { ...adventure, dialogue }, characters: [] },
        global: { provide: { [marketWindowContext as symbol]: context } },
    })
    try {
        const shop = '.social-window-stack--shop'
        await wrapper.setProps({ adventure: offeredTrade })
        await flushPromises()
        const selected = wrapper.get(`${shop} [role="tab"][aria-selected="true"]`)
        expect(selected.text()).toBe('Продать')
        expect(document.activeElement).toBe(selected.element)
        expect(context.shopOpen.value).toBe(true)
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
        await flushPromises()
        expect(wrapper.emitted('command')).toEqual([
            [{ type: 'dialogue_choice', choiceId: 'close' }],
        ])
        expect(context.shopOpen.value).toBe(false)
        expect(wrapper.find('.adventure-dialogue').exists()).toBe(false)
        await wrapper.setProps({ adventure: { ...offeredTrade } })
        expect(wrapper.find(shop).exists()).toBe(false)
        await wrapper.setProps({
            adventure: { ...offeredTrade, dialogue: { ...offeredTrade.dialogue!, speechId: 9 } },
        })
        expect(wrapper.find(shop).exists()).toBe(true)
    } finally {
        wrapper.unmount()
    }
})

describe('conversation and shop navigation', () => {
    it('offers the named neighbor from the shop and suppresses old orders while switching', async () => {
        const wrapper = mount(AdventureDialogue, {
            props: { adventure, characters: [], neighbors },
            attachTo: document.body,
        })
        try {
            const right = `[data-dialogue-target-switch="${neighborKey}"]`
            expect(wrapper.get(right).text()).toContain('Лада')
            await wrapper.get('[data-dialogue-action="trade"]').trigger('click')
            await flushPromises()
            const shop = wrapper.get('.social-window-stack--shop')
            await shop.get(right).trigger('click')
            expect(wrapper.emitted('switchTarget')).toEqual([[neighborKey]])
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'dialogue_choice', choiceId: 'trade' }],
            ])
            await wrapper.setProps({ switchPending: true })
            expect(shop.get('.adventure-shop-window').attributes('inert')).toBeDefined()
            expect(shop.get('[role="status"]').text()).toBe('Переключение…')
            await shop.get('.adventure-shop button').trigger('click')
            await shop.get('footer button').trigger('click')
            expect(wrapper.find('.social-window-stack--shop').exists()).toBe(true)
            expect(wrapper.emitted('command')).toHaveLength(1)
            await wrapper.setProps({ switchPending: false })
            await flushPromises()
            expect(document.activeElement).toBe(shop.get('.adventure-shop button').element)
            await wrapper.setProps({
                adventure: { ...adventure, dialogue: null },
                switchPending: false,
            })
            expect(wrapper.find('.social-window-stack--shop').exists()).toBe(false)
        } finally {
            wrapper.unmount()
        }
    })

    it('shows goods only after the trade choice, skips unaffordable goods, and returns to conversation', async () => {
        const wrapper = mount(AdventureDialogue, {
            props: { adventure, characters: [] },
            attachTo: document.body,
        })
        try {
            await flushPromises()
            expect(wrapper.find('[aria-label="Торговля"]').exists()).toBe(false)
            await wrapper
                .get('.dialogue-panel__choices button')
                .trigger('keydown', { code: 'KeyF', key: 'а' })
            await flushPromises()
            expect(wrapper.find('.dialogue-panel__choices').exists()).toBe(false)
            expect(wrapper.find('.adventure-dialogue').exists()).toBe(false)
            const shop = wrapper.get('[role="dialog"][aria-label="Товары · Савва"]')
            expect(shop.find('[aria-label="Торговля"]').exists()).toBe(true)
            const shopButtons = shop.findAll('.adventure-shop button')
            const back = shop.get('footer button')
            expect(document.activeElement).toBe(shopButtons[0]?.element)
            expect(shopButtons[1]?.attributes('disabled')).toBeDefined()
            await shopButtons[0]?.trigger('keydown', { code: 'KeyF', key: 'а' })
            await shopButtons[0]?.trigger('keydown', { code: 'KeyS', key: 'ы' })
            expect(document.activeElement).toBe(back.element)
            await back.trigger('keydown', { code: 'Escape' })
            expect(wrapper.find('[aria-label="Торговля"]').exists()).toBe(false)
            expect(document.activeElement).toBe(
                wrapper.get('[data-dialogue-action="trade"]').element
            )
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'dialogue_choice', choiceId: 'trade' }],
                [{ type: 'trade', itemId: 'food' }],
            ])
            await wrapper
                .get('.dialogue-panel__choices button')
                .trigger('keydown', { code: 'Escape' })
            expect(wrapper.emitted('command')?.at(-1)).toEqual([
                { type: 'dialogue_choice', choiceId: 'close' },
            ])
        } finally {
            wrapper.unmount()
        }
    })
    it('explains a city trading ban and disables offers without trapping keyboard navigation', async () => {
        const blocked: AdventureSnapshot = {
            ...adventure,
            dialogue: {
                ...adventure.dialogue!,
                tradeBlockedReason: 'Вы в чёрном списке Новогорода.',
            },
        }
        const wrapper = mount(AdventureDialogue, {
            props: { adventure: blocked, characters: [] },
            attachTo: document.body,
        })
        try {
            await wrapper.get('.dialogue-panel__choices button').trigger('click')
            await flushPromises()
            expect(wrapper.get('.trade-refusal').text()).toBe('Вы в чёрном списке Новогорода.')
            const offers = wrapper.findAll('.adventure-shop button')
            expect(offers[0]?.attributes('disabled')).toBeDefined()
            expect(offers[1]?.attributes('disabled')).toBeDefined()
            expect(document.activeElement).toBe(
                wrapper.get('.social-window-stack--shop footer button').element
            )
            await offers[0]?.trigger('click')
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'dialogue_choice', choiceId: 'trade' }],
            ])
            await wrapper.setProps({ adventure })
            expect(wrapper.find('.trade-refusal').exists()).toBe(false)
            expect(
                wrapper.findAll('.adventure-shop button')[0]?.attributes('disabled')
            ).toBeUndefined()
            await wrapper.get('.social-window-stack--shop header button').trigger('click')
            expect(wrapper.find('.social-window-stack--shop').exists()).toBe(false)
            expect(wrapper.find('.adventure-dialogue').exists()).toBe(true)
        } finally {
            wrapper.unmount()
        }
    })
})

it('sends a fresh server command for each quoted purchase from the market window', async () => {
    const row = {
        itemId: 'food',
        label: 'Яблоко',
        stock: 8,
        target: 8,
        capacity: 16,
        basePrice: 4,
        consumptionPer10Minutes: 0,
        buyPrice: 4,
        sellPrice: 2,
        deliveredLast10Minutes: 0,
        consumedLast10Minutes: 0,
    } as const
    const wrapper = mount(AdventureDialogue, {
        attachTo: document.body,
        props: {
            characters: [],
            adventure: {
                ...adventure,
                dialogue: { ...adventure.dialogue!, initialView: 'shop' },
                market: { cityId: 'city', cityName: 'Новогород', revision: 1, rows: [row] },
            },
        },
    })
    try {
        await flushPromises()
        const shop = wrapper.get('.social-window-stack--shop')
        const quantity = shop.get('input[type="number"]')
        const buyTab = shop.get('[role="tab"][aria-selected="true"]')
        expect(document.activeElement).toBe(buyTab.element)
        await buyTab.trigger('keydown', { code: 'Tab', key: 'Tab' })
        expect(document.activeElement).toBe(quantity.element)
        await quantity.setValue(2)
        const buy = shop.get('.market-row button')
        await buy.trigger('click')
        await buy.trigger('click')
        const requests = wrapper.emitted<[ClientMessage]>('command')?.flat()
        expect(requests).toEqual([
            expect.objectContaining({
                type: 'market_trade',
                npcId: 'merchant',
                itemId: 'food',
                side: 'buy',
                quantity: 2,
                expectedTotal: quoteMarketTrade(row, 'buy', 2),
                requestId: expect.any(String),
            }),
            expect.objectContaining({ type: 'market_trade', requestId: expect.any(String) }),
        ])
        const [first, second] = requests ?? []
        expect(
            first?.type === 'market_trade' &&
                second?.type === 'market_trade' &&
                first.requestId !== second.requestId
        ).toBe(true)
    } finally {
        wrapper.unmount()
    }
})

it('sends the repair quote even when the service does not sell items', async () => {
    const wrapper = mount(AdventureDialogue, {
        props: {
            characters: [],
            adventure: {
                ...adventure,
                dialogue: {
                    ...adventure.dialogue!,
                    npcId: 'smith',
                    initialView: 'repair',
                    canTrade: false,
                },
                repairs: {
                    npcId: 'smith',
                    total: 10,
                    items: [
                        {
                            instanceId: 'broken',
                            itemId: 'simple_sword',
                            label: 'Простой меч',
                            durability: 0,
                            maxDurability: 200,
                            price: 10,
                            equipped: true,
                        },
                    ],
                },
            },
        },
    })
    try {
        await wrapper.get('.repair-workshop > button').trigger('click')
        expect(wrapper.emitted('command')).toEqual([
            [
                {
                    type: 'repair_items',
                    npcId: 'smith',
                    instanceIds: ['broken'],
                    expectedTotal: 10,
                    requestId: expect.any(String),
                },
            ],
        ])
    } finally {
        wrapper.unmount()
    }
})

it('reads a sign with one heading and confirms its focused close action with F without repeat', async () => {
    const sign: AdventureSnapshot = {
        ...adventure,
        dialogue: {
            kind: 'sign',
            npcId: 'object:chapel',
            npcName: 'Часовня памяти',
            title: 'Часовня памяти',
            text: 'Выбор покровителя. Сестра Вера отпускает грехи за 30 золотых.',
            canTrade: false,
            choices: [{ id: 'leave', label: 'Закрыть' }],
        },
    }
    const wrapper = mount(AdventureDialogue, {
        props: { adventure: sign, characters: [] },
        attachTo: document.body,
    })
    try {
        await flushPromises()
        expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe(
            'Табличка: Часовня памяти'
        )
        expect(wrapper.findAll('h2')).toHaveLength(1)
        expect(wrapper.get('h2').text()).toBe('Часовня памяти')
        expect(wrapper.get('.dialogue-panel__text').text()).toBe(sign.dialogue!.text)
        expect(wrapper.find('.soul-badge').exists()).toBe(false)
        const close = wrapper.get('[data-dialogue-action]')
        await close.trigger('keydown', { code: 'KeyF', key: 'а' })
        await close.trigger('keydown', { code: 'KeyF', repeat: true })
        expect(wrapper.emitted('command')).toEqual([
            [{ type: 'dialogue_choice', choiceId: 'leave' }],
        ])
        await close.trigger('keydown', { code: 'Escape' })
        expect(wrapper.emitted('command')?.at(-1)).toEqual([
            { type: 'dialogue_choice', choiceId: 'close' },
        ])
    } finally {
        wrapper.unmount()
    }
})

describe('speech bubble keyboard ownership', () => {
    it('keeps the only speech text in its bubble and closes the owning dialogue when Escape starts inside it', async () => {
        const player = characterFixture('player'),
            merchant = characterFixture('merchant')
        const wrapper = mount(AdventureDialogue, {
            props: { adventure, characters: [player, merchant], neighbors },
            attachTo: document.body,
        })
        const speech = mount(SpeechBubbles, {
            props: {
                player,
                snapshot: { ...worldFixture([player, merchant]), adventure },
                game: {
                    projectCharacter: () => ({ x: 100, y: 200, width: 390, height: 700 }),
                } as never,
            },
            attachTo: document.body,
        })
        try {
            await flushPromises()
            expect(wrapper.text()).not.toContain(adventure.dialogue!.text)
            expect(speech.get('.speech-text').text()).toBe(adventure.dialogue!.text)
            const neighbor = wrapper.get(`[data-dialogue-target-switch="${neighborKey}"]`)
            const choice = wrapper.get('[data-dialogue-action="trade"]')
            await wrapper
                .get('.dialogue-panel__choices button')
                .trigger('keydown', { code: 'PageDown' })
            expect(document.activeElement).toBe(speech.get('.speech-text').element)
            await speech.get('.speech-text').trigger('keydown', { code: 'Tab' })
            expect(document.activeElement).toBe(neighbor.element)
            await neighbor.trigger('keydown', { code: 'Tab' })
            expect(document.activeElement).toBe(choice.element)
            await choice.trigger('keydown', { code: 'PageUp' })
            expect(document.activeElement).toBe(speech.get('.speech-text').element)
            await speech.get('.speech-text').trigger('keydown', { code: 'Escape' })
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'dialogue_choice', choiceId: 'close' }],
            ])
        } finally {
            wrapper.unmount()
            speech.unmount()
        }
    })
})
