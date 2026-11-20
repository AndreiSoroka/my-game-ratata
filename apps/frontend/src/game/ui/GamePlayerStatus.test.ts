import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import {
    faithKnownStatusFixture,
    faithUnknownMoodStatusFixture,
    LONG_PLAYER_NAME,
    playerStatusFixture,
    wantedStatusFixture,
} from '../testing/playerStatusFixture'
import GamePlayerStatus from './GamePlayerStatus.vue'

describe('production player status', () => {
    it('shows the full nickname to assistive technology and two accessible identity icons', () => {
        expect(LONG_PLAYER_NAME).toHaveLength(24)
        const wrapper = mount(GamePlayerStatus, {
            props: { character: playerStatusFixture({ nickname: LONG_PLAYER_NAME }) },
        })
        expect(wrapper.get('h2').text()).toBe(LONG_PLAYER_NAME)
        expect(wrapper.get('h2').attributes('title')).toBe(LONG_PLAYER_NAME)
        const panel = wrapper.get('[role="region"][aria-label="Player status"]')
        expect(panel.classes()).toContain('character-hud-frame')
        expect(panel.findAll('[role="separator"][aria-hidden="true"]')).toHaveLength(2)
        expect(
            wrapper.findAll('[role="img"]').map((icon) => icon.attributes('aria-label'))
        ).toEqual(['Искра', 'Есть речь'])
        for (const label of ['Connected', 'Шаг', 'Рывок', 'DMG', 'Dodge', 'Crit', 'Speed', 'CD'])
            expect(wrapper.text()).not.toContain(label)
        expect(
            wrapper.findAll('.player-status__resource-label').map((label) => label.text())
        ).toEqual(['HP', 'MP', 'EN'])
        expect(wrapper.findAll('.game-bar__label')).toHaveLength(0)
        expect(wrapper.findAll('[role="progressbar"]')).toHaveLength(3)
        expect(wrapper.findAll('[aria-valuetext]')).toHaveLength(0)
        wrapper.unmount()
    })
    it('keeps zero resources readable without NaN or a hidden resource track', () => {
        const wrapper = mount(GamePlayerStatus, {
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
            wrapper.findAll('[role="progressbar"]').map((bar) => bar.attributes('aria-valuenow'))
        ).toEqual(['0', '0', '0'])
        expect(wrapper.findAll('.game-bar__label').map((bar) => bar.text())).toEqual([
            '0/26',
            '0/0',
            '0/100',
        ])
        expect(wrapper.text()).not.toContain('NaN')
        wrapper.unmount()
    })
    it('rounds authorized numbers and removes them when resource visibility changes', async () => {
        const wrapper = mount(GamePlayerStatus, {
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
        expect(wrapper.findAll('.game-bar__label').map((bar) => bar.text())).toEqual([
            '18/30',
            '40/40',
            '102/150',
        ])
        const health = wrapper.get('[aria-label="Health"]')
        expect(health.attributes('aria-valuetext')).toBe('18/30')
        expect(Number(health.attributes('aria-valuenow'))).toBeCloseTo(59.568)
        await wrapper.setProps({
            character: playerStatusFixture({
                nickname: 'Новое имя',
                health: { kind: 'percent', percent: 59 },
                resources: {
                    mana: { kind: 'percent', percent: 99, hasCapacity: true },
                    energy: { kind: 'exact', current: 102.4, max: 150 },
                },
            }),
        })
        expect(wrapper.get('h2').text()).toBe('Новое имя')
        expect(wrapper.findAll('.game-bar__label').map((bar) => bar.text())).toEqual(['102/150'])
        expect(wrapper.findAll('[aria-valuetext]')).toHaveLength(1)
        expect(wrapper.text()).not.toContain('59')
        expect(wrapper.text()).not.toContain('18/30')
        expect(health.attributes('aria-valuetext')).toBeUndefined()
        expect(health.attributes('aria-valuenow')).toBe('59')
        await wrapper.setProps({ character: playerStatusFixture() })
        expect(wrapper.findAll('.game-bar__label')).toHaveLength(0)
        expect(wrapper.findAll('[aria-valuetext]')).toHaveLength(0)
        wrapper.unmount()
    })
    it('updates active model Spark and independent speech indicators without textual badges', async () => {
        const wrapper = mount(GamePlayerStatus, { props: { character: playerStatusFixture() } })
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

describe('earned HUD status', () => {
    it('shows the earned patron mood while withholding an unlearned prayer status', async () => {
        const character = faithKnownStatusFixture()
        const wrapper = mount(GamePlayerStatus, { props: { character } })
        const status = wrapper.get('[aria-label="Покровитель и развитие"]')
        expect(status.get('.faith-status__name').attributes('title')).toBe('Угольная Мать · ур. 3')
        expect(status.text().match(/Угольная Мать/g)).toHaveLength(1)
        const mood = status.get('.faith-status__title [data-patron-mood="benevolent"]')
        expect(mood.attributes('aria-label')).toBe('Благосклонность')
        expect(status.text()).not.toContain('Благосклонность')
        expect(wrapper.get('[data-fantasy-divider="divider-002"]').attributes('aria-hidden')).toBe(
            'true'
        )
        expect(wrapper.find('.faith-status__omen').exists()).toBe(false)
        await wrapper.setProps({
            character: { ...character, abilities: { ...character.abilities!, known: [] } },
        })
        expect(wrapper.find('[aria-label="Покровитель и развитие"]').exists()).toBe(false)
        wrapper.unmount()
    })
    it('shows the known patron and level without a mood icon or omen prose', () => {
        const character = faithUnknownMoodStatusFixture()
        const wrapper = mount(GamePlayerStatus, { props: { character } })
        expect(wrapper.get('.faith-status__name').attributes('title')).toBe('Угольная Мать · ур. 3')
        expect(wrapper.find('[data-patron-mood]').exists()).toBe(false)
        expect(wrapper.text()).not.toContain(character.progression!.deity.omen)
        wrapper.unmount()
    })
})

describe('player effects widget', () => {
    it('renders the three law statuses in separate rows outside the resources widget', () => {
        const wrapper = mount(GamePlayerStatus, { props: { character: wantedStatusFixture() } })
        const resources = wrapper.get('[aria-label="Player status"]')
        const effects = wrapper.get('[aria-label="Player effects"]')
        expect(resources.find('[data-player-effect]').exists()).toBe(false)
        expect(effects.findAll('[data-player-effect]').map((row) => row.text())).toEqual([
            'Кража · 4 с',
            'Розыск · 22 с',
            'В чёрном списке Новогорода',
        ])
        wrapper.unmount()
    })
    it('keeps the blacklist label after temporary pursuit expires', () => {
        const wrapper = mount(GamePlayerStatus, {
            props: {
                character: playerStatusFixture({
                    theft: {
                        cooldownMsLeft: 0,
                        wantedMsLeft: 0,
                        blacklisted: true,
                        accusations: [],
                        lastResult: null,
                    },
                }),
            },
        })
        const effects = wrapper.get('[aria-label="Player effects"]')
        expect(effects.findAll('[data-player-effect]').map((row) => row.text())).toEqual([
            'В чёрном списке Новогорода',
        ])
        expect(wrapper.find('[aria-label="Покровитель и развитие"]').exists()).toBe(false)
        expect(wrapper.find('[data-fantasy-divider="divider-002"]').exists()).toBe(false)
        wrapper.unmount()
    })
    it('replaces elapsed effects with the normal-state message', async () => {
        const character = playerStatusFixture({
            cooldowns: { attackMsLeft: 500, respawnMsLeft: 0, stunMsLeft: 800 },
            abilities: {
                known: ['barrier'],
                cooldowns: { barrier: 4_000 },
                casting: null,
                barrier: { expiresAt: 3_500 },
            },
            combat: { defensiveStance: false, combo: { stacks: 2, limit: 3, expiresAt: 3_000 } },
            prayerAuraEffects: ['slowed'],
        })
        const wrapper = mount(GamePlayerStatus, {
            props: { character, serverTime: 1_000 },
        })
        expect(
            wrapper
                .findAll('[data-player-effect]')
                .map((row) => row.attributes('data-player-effect'))
        ).toEqual(['stun', 'barrier', 'blade-combo', 'slowed'])
        await wrapper.setProps({
            character: {
                ...character,
                cooldowns: { ...character.cooldowns, stunMsLeft: 0 },
                prayerAuraEffects: [],
            },
            serverTime: 3_500,
        })
        const effects = wrapper.get('[aria-label="Player effects"]')
        expect(effects.text()).toContain('Всё в порядке')
        expect(effects.findAll('[data-player-effect]')).toHaveLength(0)
        wrapper.unmount()
    })
})
