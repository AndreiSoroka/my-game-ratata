import type { AdventureSnapshot } from '@my-game-ratata/contracts'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
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
        const back = '.adventure-shop button:last-child'
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

describe('conversation and shop navigation', () => {
    it('shows goods only after the trade choice, skips unaffordable goods, and returns to conversation', async () => {
        const wrapper = mount(AdventureDialogue, {
            props: { adventure, characters: [] },
            attachTo: document.body,
        })
        try {
            await flushPromises()
            expect(wrapper.find('[aria-label="Торговля"]').exists()).toBe(false)
            await wrapper
                .get('.adventure-choices button')
                .trigger('keydown', { code: 'KeyF', key: 'а' })
            await flushPromises()
            expect(wrapper.find('.adventure-choices').exists()).toBe(false)
            expect(wrapper.find('[aria-label="Торговля"]').exists()).toBe(true)
            const shopButtons = wrapper.findAll('.adventure-shop button')
            expect(document.activeElement).toBe(shopButtons[0]?.element)
            expect(shopButtons[1]?.attributes('disabled')).toBeDefined()
            await shopButtons[0]?.trigger('keydown', { code: 'KeyF', key: 'а' })
            await shopButtons[0]?.trigger('keydown', { code: 'KeyS', key: 'ы' })
            expect(document.activeElement).toBe(shopButtons[2]?.element)
            await shopButtons[2]?.trigger('keydown', { code: 'Escape' })
            expect(wrapper.find('[aria-label="Торговля"]').exists()).toBe(false)
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'dialogue_choice', choiceId: 'trade' }],
                [{ type: 'trade', itemId: 'food' }],
            ])
            await wrapper.get('.adventure-choices button').trigger('keydown', { code: 'Escape' })
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
            await wrapper.get('.adventure-choices button').trigger('click')
            await flushPromises()
            expect(wrapper.get('.trade-refusal').text()).toBe('Вы в чёрном списке Новогорода.')
            const offers = wrapper.findAll('.adventure-shop button')
            expect(offers[0]?.attributes('disabled')).toBeDefined()
            expect(offers[1]?.attributes('disabled')).toBeDefined()
            expect(document.activeElement).toBe(offers[2]?.element)
            await offers[0]?.trigger('click')
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'dialogue_choice', choiceId: 'trade' }],
            ])
            await wrapper.setProps({ adventure })
            expect(wrapper.find('.trade-refusal').exists()).toBe(false)
            expect(
                wrapper.findAll('.adventure-shop button')[0]?.attributes('disabled')
            ).toBeUndefined()
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
            expect(wrapper.get('.adventure-dialogue__text').text()).toBe(sign.dialogue!.text)
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
})

describe('speech bubble keyboard ownership', () => {
    it('keeps the only speech text in its bubble and closes the owning dialogue when Escape starts inside it', async () => {
        const player = characterFixture('player'),
            merchant = characterFixture('merchant')
        const wrapper = mount(AdventureDialogue, {
            props: { adventure, characters: [player, merchant] },
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
            await wrapper.get('.adventure-choices button').trigger('keydown', { code: 'PageDown' })
            expect(document.activeElement).toBe(speech.get('.speech-text').element)
            await speech.get('.speech-text').trigger('keydown', { code: 'Tab' })
            expect(document.activeElement).toBe(wrapper.get('.adventure-choices button').element)
            await wrapper.get('.adventure-choices button').trigger('keydown', { code: 'PageUp' })
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
