import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { LONG_PLAYER_NAME, playerStatusFixture } from '../testing/playerStatusFixture'
import PlayerStatusPanel from './PlayerStatusPanel.vue'

describe('production player status', () => {
    it('retains the full nickname and only resources plus three accessible identity icons', () => {
        expect(LONG_PLAYER_NAME).toHaveLength(24)
        const wrapper = mount(PlayerStatusPanel, {
            props: { character: playerStatusFixture({ nickname: LONG_PLAYER_NAME }) },
        })
        expect(wrapper.get('h2').text()).toBe(LONG_PLAYER_NAME)
        expect(wrapper.get('h2').attributes('title')).toBe(LONG_PLAYER_NAME)
        expect(wrapper.find('.ratata-kenney-title').exists()).toBe(false)
        expect(
            wrapper.findAll('[role="img"]').map((icon) => icon.attributes('aria-label'))
        ).toEqual(['Искра', 'Управляется игроком', 'Есть речь'])
        for (const label of ['Connected', 'Шаг', 'Рывок', 'DMG', 'Dodge', 'Crit', 'Speed', 'CD'])
            expect(wrapper.text()).not.toContain(label)
        expect(wrapper.findAll('.ratata-ui-resource__label').map((label) => label.text())).toEqual([
            'HP',
            'MP',
            'EN',
        ])
        wrapper.unmount()
    })
    it('keeps zero resources readable without NaN or a hidden resource track', () => {
        const wrapper = mount(PlayerStatusPanel, {
            props: {
                character: playerStatusFixture({
                    hp: 0,
                    resources: { mana: 0, maxMana: 0, energy: 0, maxEnergy: 100 },
                }),
            },
        })
        expect(
            wrapper.findAll('.ratata-ui-resource__value').map((bar) => bar.attributes('style'))
        ).toEqual(['width: 0%;', 'width: 0%;', 'width: 0%;'])
        expect(wrapper.findAll('.ratata-ui-resource__text').map((bar) => bar.text())).toEqual([
            '0/26',
            '0/0',
            '0/100',
        ])
        expect(wrapper.text()).not.toContain('NaN')
        wrapper.unmount()
    })
    it('updates active model Spark and independent speech indicators without textual badges', async () => {
        const wrapper = mount(PlayerStatusPanel, { props: { character: playerStatusFixture() } })
        await wrapper.setProps({
            character: playerStatusFixture({
                soul: {
                    kind: 'spark',
                    controlSource: 'model',
                    canSpeak: false,
                    personality: 'Тихий',
                    companion: null,
                },
            }),
        })
        expect(
            wrapper.findAll('[role="img"]').map((icon) => icon.attributes('aria-label'))
        ).toEqual(['Искра', 'Управляется ИИ', 'Без речи'])
        expect(wrapper.find('.soul-badge').text()).toBe('✧')
        wrapper.unmount()
    })
})
