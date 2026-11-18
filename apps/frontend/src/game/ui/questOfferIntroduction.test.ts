import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

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
