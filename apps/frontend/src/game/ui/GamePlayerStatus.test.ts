import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { masteriesFixture } from '../testing/masteryFixture'
import {
    faithKnownStatusFixture,
    faithPreciseStatusFixture,
    faithUnknownMoodStatusFixture,
    LONG_PLAYER_NAME,
    playerStatusFixture,
    wantedStatusFixture,
} from '../testing/playerStatusFixture'
import GamePlayerStatus from './GamePlayerStatus.vue'

describe('production player status', () => {
    it('shows the full nickname and accessible identity in one compact HUD frame', () => {
        expect(LONG_PLAYER_NAME).toHaveLength(24)
        const wrapper = mount(GamePlayerStatus, {
            props: { character: playerStatusFixture({ nickname: LONG_PLAYER_NAME }) },
        })
        expect(wrapper.findAll('.hud-frame')).toHaveLength(1)
        const frame = wrapper.get('.hud-frame')
        const panel = frame.get('[role="region"][aria-label="Ресурсы игрока"]')
        expect(panel.get('h2').text()).toBe(LONG_PLAYER_NAME)
        expect(panel.get('h2').attributes('title')).toBe(LONG_PLAYER_NAME)
        expect(panel.find('[data-fantasy-divider="divider-005"]').exists()).toBe(false)
        expect(panel.find('.soul-badge-icons').exists()).toBe(false)
        expect(panel.find('[aria-label="Эффекты игрока"]').exists()).toBe(false)
        const icons = frame.get('.game-player-status__identity')
        expect(icons.findAll('[role="img"]').map((icon) => icon.attributes('aria-label'))).toEqual([
            'Искра',
            'Есть речь',
        ])
        expect(wrapper.find('.player-effects-strip').exists()).toBe(false)
        expect(wrapper.text()).not.toContain('Всё в порядке')
        for (const label of ['Connected', 'Шаг', 'Рывок', 'DMG', 'Dodge', 'Crit', 'Speed', 'CD'])
            expect(wrapper.text()).not.toContain(label)
        expect(
            wrapper.findAll('.player-vitals__resource-label').map((label) => label.text())
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
})

describe('resource knowledge in production player status', () => {
    it('uses server-supplied segment layouts only for the owner pools that have them', async () => {
        const character = playerStatusFixture({
            health: { kind: 'percent', percent: 60, segments: [40, 20, 20, 20] },
            resources: {
                mana: {
                    kind: 'percent',
                    percent: 50,
                    hasCapacity: true,
                    segments: [30, 20, 10, 10, 10, 10, 10],
                },
                energy: {
                    kind: 'percent',
                    percent: 70,
                    segments: [30, 20, 10, 10, 10, 10, 10],
                    hasCapacity: true,
                },
            },
        })
        const wrapper = mount(GamePlayerStatus, { props: { character } })
        const health = wrapper.get('[role="progressbar"][aria-label="Здоровье"]')
        const energy = wrapper.get('[role="progressbar"][aria-label="Энергия"]')
        const mana = wrapper.get('[role="progressbar"][aria-label="Мана"]')
        expect(health.attributes('aria-valuenow')).toBe('60')
        expect(health.findAll('.game-bar__segment')).toHaveLength(2)
        expect(energy.attributes('aria-valuenow')).toBe('70')
        expect(energy.findAll('.game-bar__segment')).toHaveLength(4)
        expect(mana.findAll('.game-bar__segment')).toHaveLength(2)
        expect(wrapper.findAll('.game-bar__label')).toHaveLength(0)

        await wrapper.setProps({
            character: {
                ...character,
                health: { kind: 'percent', percent: 53 },
                resources: {
                    ...character.resources,
                    mana: { kind: 'exact', current: 28, max: 70 },
                    energy: { kind: 'exact', current: 63, max: 100 },
                },
            },
        })
        expect(wrapper.findAll('.game-bar__segments')).toHaveLength(0)
        expect(health.attributes('aria-valuenow')).toBe('53')
        expect(health.get('.game-bar__fill').isVisible()).toBe(true)
        expect(health.text()).toBe('')
        expect(mana.attributes('aria-valuetext')).toBe('28/70')
        expect(energy.get('.game-bar__label').text()).toBe('63/100')
        expect(energy.attributes('aria-valuetext')).toBe('63/100')

        await wrapper.setProps({ character })
        expect(energy.findAll('.game-bar__segment')).toHaveLength(4)
        expect(energy.attributes('aria-valuetext')).toBeUndefined()
        expect(mana.attributes('aria-valuetext')).toBeUndefined()
        expect(energy.text()).toBe('')
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
        const health = wrapper.get('[aria-label="Здоровье"]')
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

    it('marks a changed omen once and treats gaining access or switching patron as a baseline', async () => {
        const unearned = faithUnknownMoodStatusFixture()
        unearned.progression!.deity.perception = 'vague'
        const wrapper = mount(GamePlayerStatus, { props: { character: unearned } })
        const highlight = '[data-mood-change-id]'
        expect(wrapper.find(highlight).exists()).toBe(false)

        const hint = faithUnknownMoodStatusFixture()
        await wrapper.setProps({ character: hint })
        expect(wrapper.find(highlight).exists()).toBe(false)

        const changed = faithUnknownMoodStatusFixture()
        changed.progression!.deity.omen = 'Другой известный намёк'
        await wrapper.setProps({ character: changed })
        const first = wrapper.get(highlight)
        expect(wrapper.find('[data-patron-mood]').exists()).toBe(false)
        expect(wrapper.text()).not.toContain(changed.progression!.deity.omen)
        await wrapper.setProps({
            character: { ...changed, progression: { ...changed.progression! } },
        })
        expect(wrapper.get(highlight).element).toBe(first.element)

        const next = faithUnknownMoodStatusFixture()
        await wrapper.setProps({ character: next })
        expect(wrapper.get(highlight).attributes('data-mood-change-id')).not.toBe(
            first.attributes('data-mood-change-id')
        )

        const road = faithKnownStatusFixture()
        road.progression!.deity.id = 'road'
        road.progression!.deity.name = 'Безымянный Путник'
        road.abilities!.known = ['pray_road']
        await wrapper.setProps({ character: road })
        expect(wrapper.find(highlight).exists()).toBe(false)
        await wrapper.setProps({ character: changed })
        expect(wrapper.find(highlight).exists()).toBe(false)
        wrapper.unmount()
    })

    it('renders the earned per-step chances and countdown from the owner snapshot', async () => {
        const wrapper = mount(GamePlayerStatus, { props: { character: faithKnownStatusFixture() } })
        const chances = '.faith-status__chances'
        const timer = '.faith-status__timer'
        expect(wrapper.find(chances).exists()).toBe(false)
        expect(wrapper.find(timer).exists()).toBe(false)

        const will = faithPreciseStatusFixture()
        Object.assign(will.progression!.deity, {
            perception: 'clear',
            changesInMs: null,
            hearthPrayerChances: { purificationPerStep: 0.290909, resurrection: null },
            successChance: 0.8,
        })
        await wrapper.setProps({ character: will })
        expect(wrapper.get(chances).text()).toMatch(/Шанс лечения\s*80%/)
        expect(wrapper.get(chances).text()).toMatch(/Шанс очищения могилы\s*29,09% за шаг/)
        expect(wrapper.get(chances).text()).not.toContain('Шанс воскрешения')
        expect(wrapper.find(timer).exists()).toBe(false)

        await wrapper.setProps({ character: faithPreciseStatusFixture() })
        expect(wrapper.get(chances).text()).toMatch(/Шанс воскрешения\s*55%/)
        expect(wrapper.get(timer).text()).toBe('12 с')
        wrapper.unmount()
    })

    it('shows the patron name with the level of its prayer school', () => {
        const character = faithKnownStatusFixture()
        character.abilities!.known = ['pray_road']
        const progression = character.progression!
        progression.deity = { ...progression.deity, id: 'road', name: 'Безымянный Путник' }
        progression.masteries = masteriesFixture({ prayer: 3, prayer_road: 7 })

        const wrapper = mount(GamePlayerStatus, { props: { character } })
        const status = wrapper.get('.faith-status__name')
        expect(status.get('.faith-status__patron').text()).toBe('Безымянный Путник')
        expect(status.get('.faith-status__progress').text()).toBe('· ур. 7')
        expect(status.attributes('title')).toBe('Безымянный Путник · ур. 7')
        wrapper.unmount()
    })
})

describe('player identity', () => {
    it('updates active model Spark and independent speech indicators without textual badges', async () => {
        const wrapper = mount(GamePlayerStatus, { props: { character: playerStatusFixture() } })
        await wrapper.setProps({
            character: playerStatusFixture({
                soul: {
                    kind: 'spark',
                    controlSource: 'model',
                    canSpeak: false,
                },
            }),
        })
        const icons = wrapper.get('.hud-frame').get('.game-player-status__identity')
        expect(icons.findAll('[role="img"]').map((icon) => icon.attributes('aria-label'))).toEqual([
            'Искра',
            'Без речи',
        ])
        expect(icons.text()).not.toContain('Искра')
        expect(icons.text()).not.toContain('Без речи')
        wrapper.unmount()
    })
})

describe('player effects strip', () => {
    it('projects law effects into a sibling strip and discloses one effect at a time', async () => {
        const wrapper = mount(GamePlayerStatus, { props: { character: wantedStatusFixture() } })
        const frame = wrapper.get('.hud-frame')
        const strip = wrapper.get('.player-effects-strip')
        const tiles = strip.findAll('button[data-player-effect]')
        expect(frame.element.nextElementSibling).toBe(strip.element)
        expect(frame.find('[data-player-effect]').exists()).toBe(false)
        expect(tiles.map((tile) => tile.attributes('data-player-effect'))).toEqual([
            'theft-cooldown',
            'wanted',
            'blacklisted',
        ])
        expect(tiles.map((tile) => tile.attributes('aria-expanded'))).toEqual([
            'false',
            'false',
            'false',
        ])
        const theft = strip.get('[data-player-effect="theft-cooldown"]')
        const wanted = strip.get('[data-player-effect="wanted"]')
        await theft.trigger('click')
        expect(theft.attributes('aria-expanded')).toBe('true')
        const theftDetail = strip.get('[data-player-effect-detail]').text()
        expect(theftDetail).toContain('Кража')
        expect(theftDetail).toContain('4 с')
        await wanted.trigger('click')
        expect(theft.attributes('aria-expanded')).toBe('false')
        expect(wanted.attributes('aria-expanded')).toBe('true')
        const wantedDetail = strip.get('[data-player-effect-detail]').text()
        expect(wantedDetail).toContain('Розыск')
        expect(wantedDetail).toContain('22 с')
        wrapper.unmount()
    })
    it('keeps the blacklist label after temporary pursuit expires', async () => {
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
        const strip = wrapper.get('.player-effects-strip')
        expect(strip.findAll('[data-player-effect]')).toHaveLength(1)
        await strip.get('[data-player-effect="blacklisted"]').trigger('click')
        expect(strip.get('[data-player-effect-detail]').text()).toContain(
            'В чёрном списке Новогорода'
        )
        expect(wrapper.find('[aria-label="Покровитель и развитие"]').exists()).toBe(false)
        expect(wrapper.find('[data-fantasy-divider="divider-002"]').exists()).toBe(false)
        wrapper.unmount()
    })
    it('removes the strip when the last effects expire', async () => {
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
        expect(wrapper.find('.player-effects-strip').exists()).toBe(false)
        expect(wrapper.findAll('[data-player-effect]')).toHaveLength(0)
        expect(wrapper.get('.hud-frame').find('.game-player-status__identity').exists()).toBe(true)
        wrapper.unmount()
    })
})
