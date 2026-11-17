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
        await wrapper.get('select').setValue('submitter')
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
