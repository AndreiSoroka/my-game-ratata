import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { LONG_PLAYER_NAME, playerStatusFixture } from '../testing/playerStatusFixture'
import PlayerStatusPanel from './PlayerStatusPanel.vue'

describe('production player status', () => {
    it('keeps the nickname and two accessible identity icons inside its ribbon', () => {
        expect(LONG_PLAYER_NAME).toHaveLength(24)
        const wrapper = mount(PlayerStatusPanel, {
            props: { character: playerStatusFixture({ nickname: LONG_PLAYER_NAME }) },
        })
        expect(wrapper.get('h2').text()).toBe(LONG_PLAYER_NAME)
        expect(wrapper.get('h2').attributes('title')).toBe(LONG_PLAYER_NAME)
        expect(wrapper.find('.ratata-ui-status__header .game-frame--inset').exists()).toBe(true)
        expect(wrapper.find('.ratata-ui-status__header .soul-badge').exists()).toBe(true)
        expect(
            wrapper.findAll('[role="img"]').map((icon) => icon.attributes('aria-label'))
        ).toEqual(['Искра', 'Есть речь'])
        for (const label of ['Connected', 'Шаг', 'Рывок', 'DMG', 'Dodge', 'Crit', 'Speed', 'CD'])
            expect(wrapper.text()).not.toContain(label)
        expect(wrapper.findAll('.ratata-ui-resource__label').map((label) => label.text())).toEqual([
            'HP',
            'MP',
            'EN',
        ])
        expect(wrapper.findAll('.ratata-ui-resource__text')).toHaveLength(0)
        expect(wrapper.findAll('[role="progressbar"]')).toHaveLength(3)
        expect(wrapper.findAll('[aria-valuetext]')).toHaveLength(0)
        wrapper.unmount()
    })
    it('keeps zero resources readable without NaN or a hidden resource track', () => {
        const wrapper = mount(PlayerStatusPanel, {
            props: {
                character: playerStatusFixture({
                    health: { kind: 'exact', current: 0, max: 26 },
                    resources: {
                        mana: { kind: 'exact', current: 0, max: 0 },
                        energy: { kind: 'exact', current: 0, max: 100 },
                    },
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
    it('rounds authorized numbers and removes them when resource visibility changes', async () => {
        const wrapper = mount(PlayerStatusPanel, {
            props: {
                character: playerStatusFixture({
                    health: { kind: 'exact', current: 17.870400000000018, max: 30 },
                    resources: {
                        mana: { kind: 'exact', current: 39.6, max: 40 },
                        energy: { kind: 'exact', current: 102.4, max: 150 },
                    },
                }),
            },
        })
        expect(wrapper.findAll('.ratata-ui-resource__text').map((bar) => bar.text())).toEqual([
            '18/30',
            '40/40',
            '102/150',
        ])
        expect(wrapper.get('[aria-label="Health"]').attributes('aria-valuetext')).toBe('18/30')
        await wrapper.setProps({
            character: playerStatusFixture({
                health: { kind: 'percent', percent: 59 },
                resources: {
                    mana: { kind: 'percent', percent: 99, hasCapacity: true },
                    energy: { kind: 'percent', percent: 68, hasCapacity: true },
                },
            }),
        })
        expect(wrapper.findAll('.ratata-ui-resource__text')).toHaveLength(0)
        expect(wrapper.findAll('[aria-valuetext]')).toHaveLength(0)
        expect(wrapper.text()).not.toContain('59')
        expect(wrapper.text()).not.toContain('18/30')
        expect(wrapper.get('[aria-label="Health"]').attributes('aria-valuenow')).toBe('59')
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
        ).toEqual(['Искра', 'Без речи'])
        expect(wrapper.find('.soul-badge').text()).toBe('✧')
        wrapper.unmount()
    })
})
