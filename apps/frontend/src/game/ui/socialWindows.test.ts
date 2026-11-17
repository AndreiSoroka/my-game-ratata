import type { ClientMessage } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import PrivateConversation from './PrivateConversation.vue'
import QuestOfferWindow from './QuestOfferWindow.vue'
import { questOfferFixture, whisperFixture } from './socialFixtures'
import SocialPanels from './SocialPanels.vue'

it('sends whisper privately, clears text and rejects sending after lost reach', async () => {
    const wrapper = mount(PrivateConversation, {
        props: { conversation: whisperFixture(), playerId: 'self' },
    })
    try {
        const field = wrapper.get('input')
        await field.setValue('  Что у торговца?  ')
        await wrapper.get('form').trigger('submit')
        expect(wrapper.emitted('send')).toEqual([['Что у торговца?']])
        expect((field.element as HTMLInputElement).value).toBe('')
        await wrapper.setProps({ conversation: { ...whisperFixture(), available: false } })
        await field.setValue('Не должно отправиться')
        await wrapper.get('form').trigger('submit')
        expect(wrapper.emitted('send')).toHaveLength(1)
        expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    } finally {
        wrapper.unmount()
    }
})

it('keeps incoming whisper unobtrusive and opens it only on the recipient action', async () => {
    const outside = document.createElement('input')
    document.body.append(outside)
    outside.focus()
    const player = characterFixture('self')
    const wrapper = mount(SocialPanels, {
        props: {
            snapshot: { ...worldFixture([player]), social: { whisper: whisperFixture() } },
            player,
            characters: [player],
            connected: true,
        },
        attachTo: document.body,
    })
    try {
        expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
        expect(document.activeElement).toBe(outside)
        await wrapper.get('.social-hints button').trigger('click')
        expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('Шёпот: Капля')
        expect(wrapper.emitted('command')).toContainEqual([{ type: 'release_input' }])
        expect(wrapper.vm.hasOpenWindow).toBe(true)
    } finally {
        wrapper.unmount()
        outside.remove()
    }
})

it('shows approved quest terms and accepts the exact offer and revision explicitly', async () => {
    const offer = questOfferFixture()
    const wrapper = mount(QuestOfferWindow, {
        props: { offer, characters: [], serverTime: 100_000, occupied: false },
    })
    try {
        expect(wrapper.text()).toContain('Доставить 3 пшеницы на городской склад.')
        expect(wrapper.text()).toContain('Предметную награду получает тот, кто сдаёт договор.')
        expect(wrapper.emitted('command')).toBeUndefined()
        await wrapper.get('input[value="submitter"]').setValue(true)
        const take = wrapper.findAll('button').find((button) => button.text() === 'Взять')!
        await take.trigger('click')
        expect(wrapper.emitted('command')).toEqual([
            [
                {
                    type: 'quest_offer_answer',
                    offerId: 'offer-1',
                    revision: 3,
                    accept: true,
                    rewardMode: 'submitter',
                },
            ],
        ])
        await wrapper.setProps({ occupied: true })
        expect(take.attributes('disabled')).toBeDefined()
        await wrapper.setProps({ occupied: false, serverTime: offer.expiresAt })
        expect(take.attributes('disabled')).toBeDefined()
    } finally {
        wrapper.unmount()
    }
})

it('closes the completed exchange and its whisper without reopening on repeated snapshots', async () => {
    const player = characterFixture('self')
    const base = worldFixture([player])
    const { exchangeFixture } = await import('./socialFixtures')
    const snapshot = { ...base, social: { whisper: whisperFixture(), exchange: exchangeFixture() } }
    const view = mount(SocialPanels, {
        props: { snapshot, player, characters: [player], connected: true },
    })
    try {
        expect(view.find('[aria-label="Обмен: Капля"]').exists()).toBe(true)
        const completed = {
            ...snapshot,
            social: {
                ...snapshot.social,
                exchange: exchangeFixture({ status: 'completed', receiptId: 'trade-receipt-1' }),
            },
        }
        await view.setProps({ snapshot: completed })
        expect(view.find('[role="dialog"]').exists()).toBe(false)
        expect(view.vm.hasOpenWindow).toBe(false)
        expect(
            view
                .emitted<[ClientMessage]>('command')
                ?.flat()
                .some((command) => command.type === 'exchange_cancel')
        ).not.toBe(true)
        await view.setProps({ snapshot: { ...completed, tick: completed.tick + 1 } })
        expect(view.find('[role="dialog"]').exists()).toBe(false)
        await view.setProps({
            snapshot: {
                ...snapshot,
                social: { ...snapshot.social, exchange: exchangeFixture({ id: 'exchange-2' }) },
            },
        })
        expect(view.find('[aria-label="Обмен: Капля"]').exists()).toBe(true)
    } finally {
        view.unmount()
    }
})

it('retains quest whisper text and reward selection across revisions of the same offer', async () => {
    const player = characterFixture('self')
    const snapshot = {
        ...worldFixture([player]),
        social: { whisper: whisperFixture(), questOffer: questOfferFixture() },
    }
    const view = mount(SocialPanels, {
        props: { snapshot, player, characters: [player], connected: true },
    })
    try {
        const field = view.get('.private-conversation input')
        await field.setValue('Можешь добавить яблоко?')
        await view.get('input[value="submitter"]').setValue(true)
        await view.setProps({
            snapshot: {
                ...snapshot,
                social: {
                    ...snapshot.social,
                    questOffer: { ...questOfferFixture(), revision: 4, rewardGold: 20 },
                },
            },
        })
        expect(view.get('.private-conversation input').element).toBe(field.element)
        expect((field.element as HTMLInputElement).value).toBe('Можешь добавить яблоко?')
        expect(view.get('input[value="submitter"]').element).toHaveProperty('checked', true)
        expect(view.text()).toContain('Заказчик изменил награду')
        const take = view.findAll('button').find((button) => button.text() === 'Взять')!
        await take.trigger('click')
        expect(view.emitted('command')?.flat()).toContainEqual({
            type: 'quest_offer_answer',
            offerId: 'offer-1',
            revision: 4,
            accept: true,
            rewardMode: 'submitter',
        })
    } finally {
        view.unmount()
    }
})

it('does not steal focus from reopened whisper when completed trade snapshots repeat', async () => {
    const { exchangeFixture } = await import('./socialFixtures')
    const player = characterFixture('self')
    const canvas = document.createElement('canvas')
    canvas.dataset.gameCanvas = 'true'
    canvas.tabIndex = 0
    document.body.append(canvas)
    const snapshot = {
        ...worldFixture([player]),
        social: {
            whisper: whisperFixture(),
            exchange: exchangeFixture({ status: 'completed', receiptId: 'paid-1' }),
        },
    }
    const view = mount(SocialPanels, {
        props: { snapshot, player, characters: [player], connected: true },
        attachTo: document.body,
    })
    try {
        await view.get('.social-hints button').trigger('click')
        const input = view.get('.private-conversation input').element as HTMLInputElement
        input.focus()
        await view.setProps({
            snapshot: {
                ...snapshot,
                tick: snapshot.tick + 1,
                social: { ...snapshot.social, exchange: { ...snapshot.social.exchange } },
            },
        })
        expect(document.activeElement).toBe(input)
    } finally {
        view.unmount()
        canvas.remove()
    }
})
