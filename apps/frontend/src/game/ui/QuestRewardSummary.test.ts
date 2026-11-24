import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { QuestOfferPanel, QuestRewardSummary } from '@/entities/quests'

describe('quest reward presentation', () => {
    it('distinguishes the total budget from the observer’s actual received share', () => {
        const wrapper = mount(QuestRewardSummary, {
            props: {
                total: 40,
                mode: 'party_equal',
                completed: true,
                playerId: 'self',
                shares: [
                    { characterId: 'other', gold: 14 },
                    { characterId: 'self', gold: 13 },
                    { characterId: 'late', gold: 13 },
                ],
            },
        })
        try {
            expect(wrapper.text()).toContain('Общая награда: 40 золотых')
            expect(wrapper.text()).toContain('Получено вами: 13 золотых')
            expect(wrapper.text()).not.toContain('Получено вами: 40')
        } finally {
            wrapper.unmount()
        }
    })
    it('supports F confirmation on the focused reward option without held repeats', async () => {
        const wrapper = mount(QuestOfferPanel, { props: { rewardGold: 30 } })
        try {
            await wrapper
                .get('input[value="submitter"]')
                .trigger('keydown', { code: 'KeyF', repeat: true })
            expect(wrapper.emitted('update:rewardMode')).toBeUndefined()
            await wrapper
                .get('input[value="submitter"]')
                .trigger('keydown', { code: 'KeyF', repeat: false })
            expect(wrapper.emitted('update:rewardMode')).toEqual([['submitter']])
        } finally {
            wrapper.unmount()
        }
    })
})
