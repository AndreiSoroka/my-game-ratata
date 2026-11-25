import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { GraveDetails } from '@/entities/graves'
import { gameLocale, setGameLocale } from '@/shared/lib/i18n'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { graveFixture } from '../testing/graveFixture'
import { gravePrayerPreview } from './graveInteractions'
import { nearbyInteractionTarget } from './nearbyInteractionActions'

const cleric = () =>
    characterFixture('cleric', {
        heroClass: 'cleric',
        abilities: { known: ['pray'], cooldowns: {}, casting: null, barrier: null },
    })
describe('explicit grave interactions', () => {
    it.each(['unknown', 'mana', 'cooldown', 'casting', 'dead', 'far', 'hidden'] as const)(
        'explains the %s requirement without choosing a different prayer',
        (failure) => {
            const player = cleric()
            const grave = graveFixture()
            if (failure === 'unknown') player.abilities!.known = []
            if (failure === 'mana') player.resourceChecks!.prayers.pray.purify_grave = 'mana'
            if (failure === 'cooldown') player.abilities!.cooldowns.pray = 1
            if (failure === 'casting')
                player.abilities!.casting = {
                    abilityId: 'pray',
                    targetId: 'ally',
                    startedAt: 0,
                    completesAt: 1000,
                }
            if (failure === 'dead') player.alive = false
            if (failure === 'far') grave.position.y = 49
            const preview = gravePrayerPreview(player, grave, failure !== 'hidden')
            expect(preview.unavailableReason).toBeTruthy()
            expect(preview.intent).toEqual({
                mode: 'purify_grave',
                target: { kind: 'grave', id: grave.id },
            })
        }
    )
    it('lets any character with learned prayer purify and uses effective reach and duration', () => {
        const player = cleric()
        player.heroClass = 'vanguard'
        player.abilities!.prayer = {
            radius: 64,
            durationMs: 2700,
            manaCost: 5,
            area: false,
            harm: false,
        }
        const preview = gravePrayerPreview(player, graveFixture({ position: { x: 0, y: 64 } }))
        expect(preview.unavailableReason).toBeNull()
        expect(preview.durationMs).toBe(2700)
    })
    it('removes purified, hidden, unreachable and dead-player targets from F interaction', () => {
        const player = cleric()
        const grave = graveFixture()
        const snapshot = { ...worldFixture([player]), graves: [grave] }
        expect(nearbyInteractionTarget(snapshot, player, [])).toMatchObject({
            key: `grave:${grave.id}`,
            actions: [],
        })
        expect(nearbyInteractionTarget(snapshot, player, [], () => false)).toBeUndefined()
        expect(
            nearbyInteractionTarget(
                { ...snapshot, graves: [{ ...grave, phase: 'purified' }] },
                player,
                []
            )
        ).toBeUndefined()
        expect(
            nearbyInteractionTarget(
                { ...snapshot, graves: [{ ...grave, position: { x: 0, y: 49 } }] },
                player,
                []
            )
        ).toBeUndefined()
        expect(nearbyInteractionTarget(snapshot, { ...player, alive: false }, [])).toBeUndefined()
    })
})
describe('reusable grave facts', () => {
    it('rounds permitted HP and localizes the guidance while preserving the restoration timer', async () => {
        const previous = gameLocale.value
        setGameLocale('ru')
        const wrapper = mount(GraveDetails, { props: { grave: graveFixture(), serverTime: 1000 } })
        try {
            expect(wrapper.text()).toContain('100/100 HP')
            expect(wrapper.text()).toContain('Киркой быстрее, оружием и магией дольше.')
            expect(wrapper.get('.bar-track').attributes('style')).toContain('14px')
            setGameLocale('en')
            await wrapper.vm.$nextTick()
            expect(wrapper.text()).toContain(
                'Skeletons can rise from graves, so graves must be destroyed or purified.'
            )
            expect(wrapper.text()).toContain(
                'A pickaxe works fastest. Weapons and magic take longer.'
            )
            await wrapper.setProps({
                grave: graveFixture({
                    phase: 'ruined',
                    health: { kind: 'percent', percent: 0 },
                    restoresAt: 181_000,
                    purification: { completed: 2, required: 5 },
                }),
            })
            expect(wrapper.text()).not.toContain('HP')
            expect(wrapper.text()).toContain('3:00')
            expect(wrapper.get('[aria-label="Grave cleansing"]').attributes('aria-valuenow')).toBe(
                '2'
            )
            await wrapper.setProps({ serverTime: 182_000 })
            expect(wrapper.text()).toContain('0:00')
        } finally {
            wrapper.unmount()
            setGameLocale(previous)
        }
    })
})
