import { previewPrayerFromSnapshots } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import ActionHotbar from './ActionHotbar.vue'

function priest() {
    return characterFixture('self', {
        abilities: { known: ['pray'], cooldowns: {}, casting: null, barrier: null },
    })
}

describe('prayer without an eligible target', () => {
    it('offers a plain prayer at full health and sends the exact cosmetic intent', async () => {
        const player = priest()
        player.resources.mana = 0
        const wrapper = mount(ActionHotbar, {
            props: { player, characters: [player], blocked: false },
        })
        try {
            await wrapper.vm.edit(0)
            await wrapper.get('.hotbar-picker button').trigger('click')
            expect(wrapper.get('.prayer-preview').text()).toBe('Помолиться · 0 MP · Без эффекта')
            wrapper.vm.activate(0)
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'use_ability', abilityId: 'pray', intent: { mode: 'devotion' } }],
            ])

            await wrapper.setProps({
                player: {
                    ...player,
                    abilities: { ...player.abilities!, cooldowns: { pray: 2500 } },
                },
            })
            wrapper.vm.activate(0)
            expect(wrapper.emitted('command')?.[1]).toEqual([
                { type: 'auto_action', action: { kind: 'prayer', intent: { mode: 'devotion' } } },
            ])
            expect(wrapper.get('.prayer-preview').text()).toBe('Молитва восстанавливается.')
        } finally {
            wrapper.unmount()
        }
    })

    it('does not substitute a wounded neighbor for an ineligible selected target', () => {
        const player = priest()
        const healthy = characterFixture('healthy')
        const wounded = characterFixture('wounded', { hp: 2 })
        for (const selected of [healthy.id, 'lost-target']) {
            const preview = previewPrayerFromSnapshots(player, [healthy, wounded], selected)
            expect(preview.intent).toEqual({ mode: 'devotion' })
            expect(preview.unavailableReason).toBeNull()
            expect(preview.harmfulTargets).toBe(0)
        }
        expect(previewPrayerFromSnapshots(player, [healthy, wounded]).intent).toEqual({
            mode: 'restore',
            targetId: wounded.id,
        })
    })

    it('keeps availability checks for death, stun and knowledge while miracles still cost mana', () => {
        const player = priest()
        for (const unavailable of [
            { ...player, alive: false },
            { ...player, cooldowns: { ...player.cooldowns, stunMsLeft: 500 } },
            { ...player, abilities: { ...player.abilities!, known: [] } },
        ]) {
            expect(previewPrayerFromSnapshots(unavailable, []).intent).toEqual({ mode: 'devotion' })
            expect(previewPrayerFromSnapshots(unavailable, []).unavailableReason).not.toBeNull()
        }
        const wounded = { ...player, hp: 5, resources: { ...player.resources, mana: 4 } }
        expect(previewPrayerFromSnapshots(wounded, []).manaCost).toBe(5)
        expect(previewPrayerFromSnapshots(wounded, []).unavailableReason).toBe('Недостаточно маны.')
    })
})
