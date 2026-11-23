import { workerQuestMessages } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { nextTick } from 'vue'

import { gameLocale, setGameLocale } from '@/shared/lib/i18n'

import QuestOfferWindow from './QuestOfferWindow.vue'
import { questOfferFixture } from './socialFixtures'

it('shows the actual invitation above the terms, without emitting speech or accepting a contract', () => {
    const introduction = 'Вот условия поручения, которое мы обсудили.'
    const wrapper = mount(QuestOfferWindow, {
        props: {
            offer: { ...questOfferFixture(), introduction },
            characters: [],
            serverTime: 100_000,
            occupied: false,
        },
    })
    try {
        const paragraph = wrapper.get('.quest-offer__introduction')
        const title = wrapper.get('h3')
        expect(paragraph.text()).toBe(introduction)
        expect(
            paragraph.element.compareDocumentPosition(title.element) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).not.toBe(0)
        expect(wrapper.emitted('command')).toBeUndefined()
    } finally {
        wrapper.unmount()
    }
})

it('escapes prose and replaces it rather than duplicating it on repeated snapshots or a different offer', async () => {
    const offer = {
        ...questOfferFixture(),
        introduction: '<img src=x onerror="alert(1)"> Сначала обсудим условия.',
    }
    const wrapper = mount(QuestOfferWindow, {
        props: { offer, characters: [], serverTime: 100_000, occupied: false },
    })
    try {
        expect(wrapper.get('.quest-offer__introduction').text()).toBe(offer.introduction)
        expect(wrapper.find('.quest-offer__introduction img').exists()).toBe(false)
        await wrapper.setProps({ offer: { ...offer } })
        expect(wrapper.findAll('.quest-offer__introduction')).toHaveLength(1)
        await wrapper.setProps({
            offer: { ...offer, id: 'offer-2', introduction: 'Это другое поручение.' },
        })
        expect(wrapper.get('.quest-offer__introduction').text()).toBe('Это другое поручение.')
        expect(wrapper.text()).not.toContain('Сначала обсудим условия.')
        expect(wrapper.emitted('command')).toBeUndefined()
    } finally {
        wrapper.unmount()
    }
})

it('keeps legacy offers readable without an introduction', () => {
    const wrapper = mount(QuestOfferWindow, {
        props: {
            offer: questOfferFixture(),
            characters: [],
            serverTime: 100_000,
            occupied: false,
        },
    })
    try {
        expect(wrapper.find('.quest-offer__introduction').exists()).toBe(false)
        expect(wrapper.text()).toContain('Доставить 3 пшеницы на городской склад.')
    } finally {
        wrapper.unmount()
    }
})

it('localizes the open offer while keeping its structured quantities and IDs', async () => {
    const previous = gameLocale.value
    const offer = {
        ...questOfferFixture(),
        ...workerQuestMessages(
            {
                id: 'request-1',
                cityId: 'map-2-2',
                clerkId: 'npc_friendly_girl_1',
                workerId: 'npc_lumberjack_1',
                workerName: 'Лесник Данила',
                locationId: 'map-2-2',
                locationName: 'Новогород',
                enemyName: 'Слизень',
                requiredTrophyItemId: 'slime_heart',
                proofAccepted: false,
                stage: 'waiting',
                reason: null,
            },
            'npc'
        ),
        issuerId: 'npc_friendly_girl_1',
        title: 'Вернуть к работе: Лесник Данила',
        objectives: [
            { kind: 'deliver', itemId: 'grain', quantity: 3, recipientId: 'city:map-2-2' },
        ] as const,
    }
    setGameLocale('ru')
    const wrapper = mount(QuestOfferWindow, {
        props: {
            offer: { ...offer, objectives: [...offer.objectives] },
            characters: [],
            serverTime: 100_000,
            occupied: false,
        },
    })
    try {
        expect(wrapper.get('h3').text()).toContain('Лесник Данила')
        setGameLocale('en')
        await nextTick()
        expect(wrapper.get('h3').text()).toBe('Back to work: Forester Danila')
        expect(wrapper.text()).toContain('Forester Danila cannot work in Novogorod')
        expect(wrapper.text()).toContain('3 × Grain')
        expect(wrapper.text()).toContain('Recipient: the city warehouse.')
        expect(wrapper.emitted('command')).toBeUndefined()
    } finally {
        wrapper.unmount()
        setGameLocale(previous)
    }
})
