import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import ActionHotbar from './ActionHotbar.vue'

it.each(['ranger', 'cleric'] as const)(
    'keeps %s attacks and abilities from falling back to another target while an object is selected',
    (heroClass) => {
        const player = characterFixture('self', {
            heroClass,
            health: { kind: 'exact', current: 5, max: 24 },
            abilities: { known: ['shot', 'pray'], cooldowns: {}, casting: null, barrier: null },
        })
        const enemy = characterFixture('nearby-enemy', { faction: 'monsters' })
        const wrapper = mount(ActionHotbar, {
            props: { player, characters: [player, enemy], blocked: false, objectTarget: true },
        })
        try {
            for (const slot of [0, 1]) {
                const button = wrapper.findAll('.hotbar-slot')[slot]!
                expect(button.attributes('aria-disabled')).toBe('true')
                expect(button.attributes('aria-description')).toContain('F')
                wrapper.vm.activate(slot)
                wrapper.vm.activate(slot)
            }
            expect(wrapper.emitted('command')).toBeUndefined()
            expect(wrapper.emitted('shotPreviewChange')?.at(-1)).toEqual([undefined])
            expect(wrapper.emitted('previewChange')?.at(-1)).toEqual([undefined])
        } finally {
            wrapper.unmount()
        }
    }
)

it('discards a pending repetition gesture when an object replaces a combat target', async () => {
    const player = characterFixture('self', {
        heroClass: 'ranger',
        abilities: { known: ['shot'], cooldowns: {}, casting: null, barrier: null },
    })
    const enemy = characterFixture('enemy', { faction: 'monsters' })
    const wrapper = mount(ActionHotbar, {
        props: { player, characters: [player, enemy], target: enemy, blocked: false },
    })
    try {
        wrapper.vm.activate(1)
        await wrapper.setProps({ objectTarget: true })
        wrapper.vm.activate(1)
        wrapper.vm.activate(1)
        expect(wrapper.emitted('command')).toEqual([
            [{ type: 'use_ability', abilityId: 'shot', targetId: enemy.id }],
        ])
    } finally {
        wrapper.unmount()
    }
})

it('requires a living target for Sniper and displays the shared attack cooldown on both arrows', async () => {
    const player = characterFixture('ranger', {
        heroClass: 'ranger',
        abilities: { known: ['shot', 'sniper_shot'], cooldowns: {}, casting: null, barrier: null },
    })
    const target = characterFixture('enemy', { faction: 'monsters' })
    const wrapper = mount(ActionHotbar, {
        props: { player, characters: [player, target], blocked: false },
    })
    try {
        await wrapper.vm.edit(2)
        await wrapper.findAll('.hotbar-picker button')[1]!.trigger('click')
        wrapper.vm.activate(2)
        expect(wrapper.emitted('command')).toBeUndefined()
        const slots = wrapper.findAll('.hotbar-slot')
        expect(slots[2]!.attributes('aria-description')).toContain('Выберите живую цель')
        await wrapper.setProps({ target })
        wrapper.vm.activate(2)
        expect(wrapper.emitted('command')).toEqual([
            [{ type: 'use_ability', abilityId: 'sniper_shot', targetId: target.id }],
        ])
        await wrapper.setProps({
            player: { ...player, cooldowns: { ...player.cooldowns, attackMsLeft: 1800 } },
        })
        expect(slots[1]!.attributes('aria-description')).toContain('Восстановление: 1.8 с')
        expect(slots[2]!.attributes('aria-description')).toContain('Восстановление: 1.8 с')
    } finally {
        wrapper.unmount()
    }
})

it('still permits self barrier, real food consumption and planting while an object is selected', async () => {
    const player = characterFixture('self', {
        abilities: { known: ['barrier'], cooldowns: {}, casting: null, barrier: null },
        inventory: [
            { instanceId: 'apple', itemId: 'food' },
            { instanceId: 'tree', itemId: 'sapling' },
        ],
    })
    const wrapper = mount(ActionHotbar, {
        props: { player, characters: [player], blocked: false, objectTarget: true },
    })
    try {
        await wrapper.vm.edit(1)
        await wrapper.get('.hotbar-picker button').trigger('click')
        wrapper.vm.assignItem(2, 'food')
        wrapper.vm.assignItem(3, 'sapling')
        await wrapper.vm.$nextTick()
        for (const slot of [1, 2, 3]) {
            expect(wrapper.findAll('.hotbar-slot')[slot]!.attributes('aria-disabled')).toBe('false')
            wrapper.vm.activate(slot)
        }
        expect(wrapper.emitted('command')).toEqual([
            [{ type: 'use_ability', abilityId: 'barrier' }],
            [{ type: 'inventory_action', action: 'eat', itemInstanceId: 'apple' }],
        ])
        expect(wrapper.emitted('plant')).toHaveLength(1)
    } finally {
        wrapper.unmount()
    }
})

it('casts fire at a friendly selection or forward and never turns two casts into repetition', async () => {
    const player = characterFixture('fire-caster', {
        abilities: { known: ['fireball'], cooldowns: {}, casting: null, barrier: null },
    })
    const friend = characterFixture('friend')
    const wrapper = mount(ActionHotbar, {
        props: { player, characters: [player, friend], target: friend, blocked: false },
    })
    try {
        await wrapper.vm.edit(1)
        await wrapper.get('.hotbar-picker button').trigger('click')
        wrapper.vm.activate(1)
        wrapper.vm.activate(1)
        await wrapper.setProps({ target: undefined })
        wrapper.vm.activate(1)
        expect(wrapper.emitted('command')).toEqual([
            [{ type: 'use_ability', abilityId: 'fireball', targetId: friend.id }],
            [{ type: 'use_ability', abilityId: 'fireball', targetId: friend.id }],
            [{ type: 'use_ability', abilityId: 'fireball' }],
        ])
    } finally {
        wrapper.unmount()
    }
})
