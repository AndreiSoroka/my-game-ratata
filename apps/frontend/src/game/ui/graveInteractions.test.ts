import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { GraveDetails } from '@/entities/graves'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { graveFixture } from '../testing/graveFixture'
import { graveActions, gravePrayerPreview } from './graveInteractions'
import { nearbyInteractionTarget } from './nearbyInteractionActions'

const cleric = () =>
    characterFixture('cleric', {
        heroClass: 'cleric',
        abilities: { known: ['pray'], cooldowns: {}, casting: null, barrier: null },
    })
describe('explicit grave interactions', () => {
    it('pins both ordinary attacks and purification to the same stable grave ID', () => {
        const grave = graveFixture()
        const actions = graveActions(cleric(), grave)
        expect(actions.map((action) => action.command)).toEqual([
            { type: 'attack', target: { kind: 'grave', id: grave.id } },
            {
                type: 'use_ability',
                abilityId: 'pray',
                intent: { mode: 'purify_grave', target: { kind: 'grave', id: grave.id } },
            },
        ])
        expect(actions.every((action) => !action.disabled)).toBe(true)
        const ruined = graveActions(cleric(), {
            ...grave,
            phase: 'ruined',
            health: { kind: 'exact', current: 0, max: 100 },
        })
        expect(ruined[0]?.disabled).toBe(true)
        expect(ruined[1]?.disabled).toBe(false)
    })
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
        expect(nearbyInteractionTarget(snapshot, player, [])?.key).toBe(`grave:${grave.id}`)
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
    it('rounds displayed HP and shows material effectiveness and server-based restoration countdown', async () => {
        const wrapper = mount(GraveDetails, { props: { grave: graveFixture(), serverTime: 1000 } })
        expect(wrapper.text()).toContain('100/100 HP')
        expect(wrapper.text()).toContain('5% урона')
        expect(wrapper.text()).toContain('100% урона')
        await wrapper.setProps({
            grave: graveFixture({
                phase: 'ruined',
                health: { kind: 'exact', current: 0, max: 100 },
                restoresAt: 181_000,
            }),
        })
        expect(wrapper.text()).toContain('3:00')
        await wrapper.setProps({ serverTime: 182_000 })
        expect(wrapper.text()).toContain('0:00')
        wrapper.unmount()
    })
})
