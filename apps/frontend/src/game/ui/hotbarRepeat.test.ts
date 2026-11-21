import type { HeroClass } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import ActionHotbar from './ActionHotbar.vue'

afterEach(() => vi.restoreAllMocks())
const enemy = characterFixture('enemy', { faction: 'monsters', relationship: 'hostile' })
function mage() {
    return characterFixture('mage', {
        heroClass: 'arcanist',
        abilities: { known: ['spark'], cooldowns: {}, casting: null, barrier: null },
    })
}
it.each<[HeroClass, string]>([
    ['vanguard', 'Пусто'],
    ['ranger', 'Выстрел'],
    ['arcanist', 'Искра'],
    ['cleric', 'Молитва'],
])('starts %s with a basic attack and its class ability', (heroClass, label) => {
    const player = characterFixture('self', { heroClass })
    const wrapper = mount(ActionHotbar, { props: { player, characters: [player], blocked: false } })
    try {
        expect(wrapper.get('.hotbar-slot').attributes('aria-label')).toContain('Удар ножом')
        expect(wrapper.findAll('.hotbar-slot')[1]!.attributes('aria-label')).toContain(label)
    } finally {
        wrapper.unmount()
    }
})
it('casts once immediately, enables repetition during cooldown, and stops without another cast', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const player = mage()
    const wrapper = mount(ActionHotbar, {
        props: { player, characters: [player, enemy], target: enemy, blocked: false },
    })
    try {
        wrapper.vm.activate(1)
        await wrapper.setProps({
            player: { ...player, abilities: { ...player.abilities!, cooldowns: { spark: 500 } } },
        })
        wrapper.vm.activate(1)
        await wrapper.setProps({ player: { ...player, control: { mode: 'none', targetId: null } } })
        wrapper.vm.activate(1)
        expect(wrapper.emitted('command')).toEqual([
            [{ type: 'use_ability', abilityId: 'spark', targetId: enemy.id }],
            [
                {
                    type: 'auto_action',
                    action: { kind: 'ability', abilityId: 'spark', targetId: enemy.id },
                },
            ],
            [{ type: 'auto_action', action: null }],
        ])
    } finally {
        wrapper.unmount()
    }
})
it('pins the first prayer intent when its single cast has already filled the target', async () => {
    const player = characterFixture('self', {
        heroClass: 'cleric',
        health: { kind: 'exact' as const, current: 2, max: 24 },
        abilities: { known: ['pray'], cooldowns: {}, casting: null, barrier: null },
    })
    const wrapper = mount(ActionHotbar, { props: { player, characters: [player], blocked: false } })
    try {
        wrapper.vm.activate(1)
        const healed = {
            ...player,
            health: { kind: 'exact' as const, current: 24, max: 24 },
            abilities: { ...player.abilities!, cooldowns: { pray: 2800 } },
        }
        await wrapper.setProps({ player: healed, characters: [healed] })
        wrapper.vm.activate(1)
        expect(wrapper.emitted('command')?.[1]).toEqual([
            {
                type: 'auto_action',
                action: {
                    kind: 'prayer',
                    abilityId: 'pray',
                    intent: { mode: 'restore', targetId: player.id },
                },
            },
        ])
    } finally {
        wrapper.unmount()
    }
})
it('can arm a meaningful prayer while waiting for mana and displays authoritative waiting', async () => {
    const player = characterFixture('self', {
        heroClass: 'cleric',
        health: { kind: 'exact' as const, current: 2, max: 24 },
        resources: {
            mana: { kind: 'percent', percent: 0, hasCapacity: true },
            energy: { kind: 'percent', percent: 100, hasCapacity: true },
        },
        resourceChecks: {
            ...characterFixture('self').resourceChecks!,
            prayers: {
                ...characterFixture('self').resourceChecks!.prayers,
                pray: { ...characterFixture('self').resourceChecks!.prayers.pray, restore: 'mana' },
            },
        },
        abilities: { known: ['pray'], cooldowns: {}, casting: null, barrier: null },
    })
    const wrapper = mount(ActionHotbar, { props: { player, characters: [player], blocked: false } })
    try {
        wrapper.vm.activate(1)
        expect(wrapper.emitted('command')).toBeUndefined()
        wrapper.vm.activate(1)
        const action = {
            kind: 'prayer',
            abilityId: 'pray',
            intent: { mode: 'restore', targetId: player.id },
        } as const
        expect(wrapper.emitted('command')).toEqual([[{ type: 'auto_action', action }]])
        await wrapper.setProps({
            player: {
                ...player,
                control: { mode: 'action', targetId: player.id, action, waiting: 'resources' },
            },
        })
        expect(wrapper.findAll('.hotbar-slot')[1]!.classes()).toContain('active')
        expect(wrapper.get('.hotbar-waiting').text()).toContain('ждём силы')
        wrapper.vm.activate(1)
        expect(wrapper.emitted('command')?.at(-1)).toEqual([{ type: 'auto_action', action: null }])
    } finally {
        wrapper.unmount()
    }
})
it('expires a double-press gesture at 301 ms and resets it when the target changes', async () => {
    let now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const player = mage(),
        other = { ...enemy, id: 'other' }
    const wrapper = mount(ActionHotbar, {
        props: { player, characters: [player, enemy, other], target: enemy, blocked: false },
    })
    try {
        wrapper.vm.activate(1)
        now += 301
        wrapper.vm.activate(1)
        await wrapper.setProps({ target: other })
        wrapper.vm.activate(1)
        expect(wrapper.emitted('command')).toEqual([
            [{ type: 'use_ability', abilityId: 'spark', targetId: enemy.id }],
            [{ type: 'use_ability', abilityId: 'spark', targetId: enemy.id }],
            [{ type: 'use_ability', abilityId: 'spark', targetId: other.id }],
        ])
    } finally {
        wrapper.unmount()
    }
})
it('consumes food once per double-press gesture and allows rebinding the basic attack', async () => {
    let now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const player = mage()
    player.inventory = [{ instanceId: 'apple', itemId: 'food' }]
    const wrapper = mount(ActionHotbar, {
        props: { player, characters: [player, enemy], target: enemy, blocked: false },
    })
    try {
        wrapper.vm.assignItem(3, 'food')
        wrapper.vm.activate(3)
        await wrapper.setProps({
            player: { ...player, inventory: [{ instanceId: 'apple-2', itemId: 'food' }] },
        })
        wrapper.vm.activate(3)
        expect(wrapper.emitted('command')).toEqual(
            Array.from({ length: 1 }, () => [
                { type: 'inventory_action', action: 'eat', itemInstanceId: 'apple' },
            ])
        )
        now += 301
        wrapper.vm.activate(3)
        expect(wrapper.emitted('command')?.at(-1)).toEqual([
            { type: 'inventory_action', action: 'eat', itemInstanceId: 'apple-2' },
        ])
        await wrapper.vm.edit(1)
        await wrapper
            .findAll('.hotbar-picker button')
            .find((button) => button.text().includes('Удар ножом'))!
            .trigger('click')
        wrapper.vm.activate(1)
        expect(wrapper.emitted('command')?.at(-1)).toEqual([
            { type: 'auto_action', action: { kind: 'attack', targetId: enemy.id, once: true } },
        ])
    } finally {
        wrapper.unmount()
    }
})

it('keeps automatic repetition on one slot when the same ability is bound twice', async () => {
    const player = mage()
    const wrapper = mount(ActionHotbar, {
        props: { player, characters: [player, enemy], target: enemy, blocked: false },
    })
    try {
        await wrapper.vm.edit(2)
        await wrapper.get('.hotbar-picker button').trigger('click')
        wrapper.vm.activate(1)
        wrapper.vm.activate(1)
        const action = { kind: 'ability', abilityId: 'spark', targetId: enemy.id } as const
        await wrapper.setProps({
            player: {
                ...player,
                control: { mode: 'action', targetId: enemy.id, action, waiting: 'cooldown' },
            },
        })
        expect(wrapper.findAll('.hotbar-slot.active')).toHaveLength(1)
        expect(wrapper.findAll('.hotbar-slot')[1]!.classes()).toContain('active')
        wrapper.vm.activate(2)
        expect(wrapper.emitted('command')?.slice(-2)).toEqual([
            [{ type: 'auto_action', action: null }],
            [{ type: 'use_ability', abilityId: 'spark', targetId: enemy.id }],
        ])
        wrapper.vm.activate(2)
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted('command')?.at(-1)).toEqual([{ type: 'auto_action', action }])
        expect(wrapper.findAll('.hotbar-slot.active')).toHaveLength(1)
        expect(wrapper.findAll('.hotbar-slot')[2]!.classes()).toContain('active')
        wrapper.vm.activate(2)
        expect(wrapper.emitted('command')?.at(-1)).toEqual([{ type: 'auto_action', action: null }])
    } finally {
        wrapper.unmount()
    }
})

it('fires Shot forward without selecting a target and previews the shared facing range', async () => {
    const player = characterFixture('ranger', {
        heroClass: 'ranger',
        basicAttackKind: 'melee',
        facing: 'left',
        position: { x: 100, y: 100 },
        abilities: { known: ['shot'], cooldowns: {}, barrier: null, casting: null },
    })
    const wrapper = mount(ActionHotbar, { props: { player, characters: [player], blocked: false } })
    try {
        expect(wrapper.findAll('.hotbar-slot')[1]!.attributes('title')).toContain(
            'Выстрел вперёд ←'
        )
        expect(wrapper.emitted('shotPreviewChange')?.at(-1)).toEqual([
            { origin: { x: 100, y: 100 }, endpoint: { x: 36, y: 100 } },
        ])
        wrapper.vm.activate(1)
        wrapper.vm.activate(1)
        expect(wrapper.emitted('command')).toEqual([
            [{ type: 'use_ability', abilityId: 'shot' }],
            [{ type: 'auto_action', action: { kind: 'ability', abilityId: 'shot' } }],
        ])
        await wrapper.setProps({ target: enemy, characters: [player, enemy] })
        expect(wrapper.emitted('shotPreviewChange')?.at(-1)).toEqual([undefined])
        wrapper.vm.resetGesture()
        wrapper.vm.activate(1)
        expect(wrapper.emitted('command')?.at(-1)).toEqual([
            { type: 'use_ability', abilityId: 'shot', targetId: enemy.id },
        ])
        await wrapper.setProps({ blocked: true, target: undefined })
        expect(wrapper.emitted('shotPreviewChange')?.at(-1)).toEqual([undefined])
    } finally {
        wrapper.unmount()
    }
})
