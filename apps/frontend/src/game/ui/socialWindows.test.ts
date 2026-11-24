import type { ClientMessage } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import PrivateConversation from './PrivateConversation.vue'
import QuestOfferWindow from './QuestOfferWindow.vue'
import {
    exchangeFixture,
    questOfferFixture,
    questTurnInFixture,
    whisperFixture,
} from './socialFixtures'
import SocialPanels from './SocialPanels.vue'

it('sends whisper privately, clears text and rejects sending after lost reach', async () => {
    const wrapper = mount(PrivateConversation, {
        props: { conversation: whisperFixture(), playerId: 'self' },
    })
    const whispers = () =>
        wrapper
            .emitted<[ClientMessage]>('command')
            ?.flat()
            .filter((command) => command.type === 'whisper')
    try {
        const field = wrapper.get('input')
        await field.setValue('  Что у торговца?  ')
        await wrapper.get('form').trigger('submit')
        expect(whispers()).toEqual([
            { type: 'whisper', targetId: 'partner', text: 'Что у торговца?' },
        ])
        expect((field.element as HTMLInputElement).value).toBe('')
        await wrapper.setProps({ conversation: { ...whisperFixture(), available: false } })
        await field.setValue('Не должно отправиться')
        await wrapper.get('form').trigger('submit')
        expect(whispers()).toHaveLength(1)
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

it('opens an incoming trade only after the accepted invitation becomes active', async () => {
    const player = characterFixture('self')
    const incoming = exchangeFixture({ status: 'invited', incoming: true })
    const snapshot = { ...worldFixture([player]), social: { exchange: incoming } }
    const view = mount(SocialPanels, {
        props: { snapshot, player, characters: [player], connected: true },
    })
    try {
        const invitation = view.get('section.exchange-invitation')
        expect(invitation.text()).toContain('Капля хочет с вами поторговаться.')
        expect(view.vm.hasOpenWindow).toBe(false)
        expect(view.emitted('command')).toBeUndefined()

        await invitation
            .findAll('button')
            .find((button) => button.text() === 'Начать торговлю')!
            .trigger('click')
        expect(view.emitted('command')).toEqual([
            [{ type: 'exchange_answer', exchangeId: incoming.id, accept: true }],
        ])
        expect(view.find('[role="dialog"]').exists()).toBe(false)
        expect(view.vm.hasOpenWindow).toBe(false)

        const active = {
            ...snapshot,
            social: { exchange: { ...incoming, status: 'active' as const } },
        }
        await view.setProps({ snapshot: active })
        expect(view.find('section.exchange-invitation').exists()).toBe(false)
        expect(view.find('[aria-label="Обмен: Капля"]').exists()).toBe(true)
        expect(view.vm.hasOpenWindow).toBe(true)
        await view.setProps({ snapshot: { ...active, tick: active.tick + 1 } })
        expect(view.emitted('open')).toHaveLength(1)
        expect(view.emitted('command')).toEqual([
            [{ type: 'exchange_answer', exchangeId: incoming.id, accept: true }],
            [{ type: 'release_input' }],
        ])
    } finally {
        view.unmount()
    }
})

it('cancels a sent invitation without opening an exchange window', async () => {
    const player = characterFixture('self')
    const pending = exchangeFixture({ status: 'invited' })
    const snapshot = { ...worldFixture([player]), social: { exchange: pending } }
    const view = mount(SocialPanels, {
        props: { snapshot, player, characters: [player], connected: true },
    })
    try {
        const invitation = view.get('section.exchange-invitation')
        expect(invitation.text()).toContain('Предложение отправлено')
        expect(view.vm.hasOpenWindow).toBe(false)
        await invitation.get('button').trigger('click')
        expect(view.emitted('command')).toEqual([
            [{ type: 'exchange_cancel', exchangeId: pending.id }],
        ])
        await view.setProps({
            snapshot: {
                ...snapshot,
                social: { exchange: { ...pending, status: 'cancelled' } },
            },
        })
        expect(view.find('section.exchange-invitation').exists()).toBe(false)
        expect(view.find('[role="dialog"]').exists()).toBe(false)
        expect(view.vm.hasOpenWindow).toBe(false)
    } finally {
        view.unmount()
    }
})

it('keeps a private conversation focused when an incoming invitation is declined', async () => {
    const player = characterFixture('self')
    const canvas = document.createElement('canvas')
    canvas.dataset.gameCanvas = 'true'
    canvas.tabIndex = 0
    document.body.append(canvas)
    const snapshot = { ...worldFixture([player]), social: { whisper: whisperFixture() } }
    const view = mount(SocialPanels, {
        props: { snapshot, player, characters: [player], connected: true },
        attachTo: document.body,
    })
    try {
        await view.get('.social-hints > button').trigger('click')
        const input = view.get('.private-conversation input').element as HTMLInputElement
        input.focus()
        const invitation = exchangeFixture({ status: 'invited', incoming: true })
        await view.setProps({
            snapshot: { ...snapshot, social: { ...snapshot.social, exchange: invitation } },
        })
        const notice = view.get('section.exchange-invitation')
        expect(notice.classes()).toContain('social-notices__invitation--over-whisper')
        expect(document.activeElement).toBe(input)
        await notice
            .findAll('button')
            .find((button) => button.text() === 'Отклонить')!
            .trigger('click')
        expect(view.emitted('command')?.at(-1)).toEqual([
            { type: 'exchange_answer', exchangeId: invitation.id, accept: false },
        ])
        expect(document.activeElement).toBe(input)
    } finally {
        view.unmount()
        canvas.remove()
    }
})

it('closes the completed exchange and its whisper without reopening on repeated snapshots', async () => {
    const player = characterFixture('self')
    const base = worldFixture([player])
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

it('binds the turn-in whisper to its issuer while another quest offer is present', async () => {
    const player = characterFixture('self')
    const questTurnIn = questTurnInFixture()
    const offerWhisper = whisperFixture()
    const snapshot = {
        ...worldFixture([player], 1000),
        social: { questTurnIn, questOffer: questOfferFixture(), whisper: offerWhisper },
    }
    const view = mount(SocialPanels, {
        props: { snapshot, player, characters: [player], connected: true },
    })
    try {
        expect(view.text()).toContain(questTurnIn.title)
        expect(view.findComponent(PrivateConversation).exists()).toBe(false)
        const whisper = {
            ...offerWhisper,
            partnerId: questTurnIn.issuerId,
            partnerName: questTurnIn.issuerName,
            messages: [{ id: '2', senderId: questTurnIn.issuerId, text: 'Слушаю вас.', at: 200 }],
        }
        await view.setProps({ snapshot: { ...snapshot, social: { ...snapshot.social, whisper } } })
        const conversation = view.getComponent(PrivateConversation)
        expect(conversation.text()).toContain('Слушаю вас.')
        expect(conversation.text()).not.toContain(offerWhisper.messages[0]!.text)
        const field = conversation.get('input')
        await field.setValue('У меня вопрос о награде.')
        await field.trigger('keydown', { code: 'Enter', key: 'Enter' })
        await conversation.get('form').trigger('submit')
        const commands = view.emitted<[ClientMessage]>('command')?.flat()
        expect(commands?.filter((entry) => entry.type !== 'speech_activity')).toEqual([
            { type: 'release_input' },
            { type: 'whisper', targetId: questTurnIn.issuerId, text: 'У меня вопрос о награде.' },
        ])
        const submitQuest = view.findAll('button').find((button) => button.text() === 'Сдать')!
        expect(submitQuest.attributes('disabled')).toBeUndefined()
    } finally {
        view.unmount()
    }
})

it('prepares the initially visible offer and prepares again only for a new offer id', async () => {
    const player = characterFixture('self')
    const questOffer = questOfferFixture()
    const snapshot = { ...worldFixture([player]), social: { questOffer } }
    const view = mount(SocialPanels, {
        props: { snapshot, player, characters: [player], connected: true },
    })
    try {
        const commands = [
            [{ type: 'release_input' }],
            [{ type: 'whisper_open', targetId: questOffer.issuerId }],
        ]
        expect(view.emitted('command')).toEqual(commands)
        await view.setProps({
            snapshot: {
                ...snapshot,
                social: { questOffer: { ...questOffer, revision: questOffer.revision + 1 } },
            },
        })
        expect(view.emitted('command')).toEqual(commands)
        await view.setProps({
            snapshot: { ...snapshot, social: { questOffer: { ...questOffer, id: 'offer-2' } } },
        })
        expect(view.emitted('command')).toEqual([...commands, ...commands])
    } finally {
        view.unmount()
    }
})

it('does not steal focus from reopened whisper when completed trade snapshots repeat', async () => {
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
