import type { AbilityId } from '@my-game-ratata/contracts'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it } from 'vitest'
import { defineComponent, type Ref, ref } from 'vue'

import { characterFixture } from '../../../game/testing/characterFixture'
import { clickWithPointer } from '../../../game/testing/clickWithPointer'
import ActionHotbar from '../ui/ActionHotbar.vue'
import { provideHotbarSession } from './hotbarSession'

function setup(
    original = characterFixture('living-hero', {
        heroClass: 'arcanist',
        abilities: { known: ['spark'], cooldowns: {}, casting: null, barrier: null },
    }),
    serverEpoch?: Ref<string>
) {
    const player = ref(original),
        visible = ref(true)
    let session: ReturnType<typeof provideHotbarSession>
    const wrapper = mount(
        defineComponent({
            components: { ActionHotbar },
            setup() {
                session = provideHotbarSession(
                    serverEpoch === undefined ? undefined : () => serverEpoch.value
                )
                return { player, visible }
            },
            template:
                '<ActionHotbar v-if="visible" :player="player" :characters="[player]" :blocked="false" />',
        }),
        { attachTo: document.body }
    )
    const hotbar = () => wrapper.getComponent(ActionHotbar)
    const labels = () =>
        wrapper
            .findAll('.hotbar-slot')
            .map((slot) => slot.attributes('aria-label')?.split('. Shift+')[0])
    const pickerButton = (label: string) =>
        wrapper.findAll('.hotbar-picker button').find((button) => button.text().includes(label))!
    async function observe(known?: AbilityId[]) {
        player.value = {
            ...player.value,
            abilities:
                known === undefined
                    ? undefined
                    : { known, cooldowns: {}, casting: null, barrier: null },
        }
        await flushPromises()
    }
    return {
        wrapper,
        hotbar,
        labels,
        pickerButton,
        observe,
        player,
        visible,
        original,
        session: session!,
    }
}
async function assignThird(wrapper: ReturnType<typeof setup>['wrapper']): Promise<void> {
    await wrapper.getComponent(ActionHotbar).vm.edit(2)
    await wrapper.get('.hotbar-picker button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.hotbar-slot')[2]!.attributes('aria-label')).toContain('Искра')
}

it('waits for the Ranger ability list and binds its starters without commands', async () => {
    const { wrapper, hotbar, labels, observe } = setup(
        characterFixture('ranger', { heroClass: 'ranger' })
    )
    try {
        expect(labels()).toEqual(['1: Удар ножом', '2: Пусто', '3: Пусто', '4: Пусто'])
        await observe(['shot', 'sniper_shot'])
        const ranger = ['1: Удар ножом', '2: Быстрый выстрел', '3: Снайперский выстрел', '4: Пусто']
        expect(labels()).toEqual(ranger)
        await observe()
        expect(labels()).toEqual(ranger)
        expect(hotbar().emitted('command')).toBeUndefined()
        expect(hotbar().emitted('cancel')).toBeUndefined()
    } finally {
        wrapper.unmount()
    }
})

it('fills the lowest free slots in order and gives an ability one chance on a full bar', async () => {
    const { wrapper, hotbar, labels, observe } = setup(
        characterFixture('vanguard', {
            heroClass: 'vanguard',
            inventory: [{ instanceId: 'apple', itemId: 'food' }],
            abilities: { known: [], cooldowns: {}, casting: null, barrier: null },
        })
    )
    try {
        hotbar().vm.assignItem(2, 'food')
        await observe(['spark', 'barrier'])
        const full = ['1: Удар ножом', '2: Искра', '3: Яблоко', '4: Барьер']
        expect(labels()).toEqual(full)
        await observe(['spark', 'barrier', 'fireball'])
        expect(labels()).toEqual(full)
        await clickWithPointer(wrapper.get('[aria-label="Очистить слот 3"]').element)
        await observe(['fireball', 'barrier', 'spark'])
        expect(labels()).toEqual(['1: Удар ножом', '2: Искра', '3: Пусто', '4: Барьер'])
        await observe(['fireball', 'barrier', 'spark', 'chains'])
        expect(labels()).toEqual(['1: Удар ножом', '2: Искра', '3: Оковы', '4: Барьер'])
        expect(hotbar().emitted('command')).toBeUndefined()
        expect(hotbar().emitted('cancel')).toBeUndefined()
    } finally {
        wrapper.unmount()
    }
})

it('preserves dormant bindings and does not restore a manually cleared ability after remount', async () => {
    const { wrapper, visible, labels, observe } = setup()
    try {
        await observe(['barrier'])
        expect(labels()).toEqual(['1: Удар ножом', '2: Искра', '3: Барьер', '4: Пусто'])
        await clickWithPointer(wrapper.get('[aria-label="Очистить слот 2"]').element)
        visible.value = false
        await observe()
        await observe(['barrier', 'spark'])
        visible.value = true
        await flushPromises()
        expect(labels()).toEqual(['1: Удар ножом', '2: Пусто', '3: Барьер', '4: Пусто'])
    } finally {
        wrapper.unmount()
    }
})

it('retains manual bindings and adds an unseen ability after a runtime remount', async () => {
    const { wrapper, visible, labels, observe } = setup()
    try {
        await assignThird(wrapper)
        visible.value = false
        await observe(['spark', 'barrier'])
        visible.value = true
        await flushPromises()
        expect(labels()).toEqual(['1: Удар ножом', '2: Искра', '3: Искра', '4: Барьер'])
    } finally {
        wrapper.unmount()
    }
})
it('uses fresh presets for a different identity and for reused ids with different identity data', async () => {
    const { wrapper, hotbar, player, original } = setup()
    try {
        await assignThird(wrapper)
        player.value = { ...original, id: 'another-hero' }
        await flushPromises()
        expect(wrapper.findAll('.hotbar-slot')[2]!.attributes('aria-label')).toContain('Пусто')
        player.value = original
        await flushPromises()
        await hotbar().vm.edit(2)
        expect(wrapper.get('.hotbar-picker').attributes('aria-label')).toBe('Назначить слот 3')
        player.value = { ...original, nickname: 'New owner of reused id' }
        await flushPromises()
        expect(wrapper.find('.hotbar-picker').exists()).toBe(false)
        expect(wrapper.findAll('.hotbar-slot')[2]!.attributes('aria-label')).toContain('Пусто')
        player.value = original
        await flushPromises()
        expect(wrapper.findAll('.hotbar-slot')[2]!.attributes('aria-label')).toContain('Искра')
    } finally {
        wrapper.unmount()
    }
})

it.each([
    ['Закрыть', 'Барьер'],
    ['Искра', 'Искра'],
])(
    'keeps an open assignment focused and applies %s after a new ability arrives',
    async (choice, expected) => {
        const { wrapper, hotbar, labels, pickerButton, observe } = setup()
        try {
            await hotbar().vm.edit(2)
            const focused = pickerButton('Искра').element
            expect(document.activeElement).toBe(focused)
            const cancelEvents = hotbar().emitted('cancel')?.length
            await observe(['spark', 'barrier'])
            expect(document.activeElement).toBe(focused)
            expect(wrapper.get('.hotbar-picker').attributes('aria-label')).toBe('Назначить слот 3')
            expect(labels()[2]).toBe('3: Барьер')
            await pickerButton(choice).trigger('click')
            expect(wrapper.find('.hotbar-picker').exists()).toBe(false)
            expect(labels()[2]).toBe(`3: ${expected}`)
            expect(hotbar().emitted('cancel')?.length).toBe(cancelEvents)
            expect(hotbar().emitted('command')).toBeUndefined()
        } finally {
            wrapper.unmount()
        }
    }
)
it('forgets the retired identity instead of handing its preferences to a later life', async () => {
    const { wrapper, player, visible, original } = setup()
    try {
        await assignThird(wrapper)
        player.value = {
            ...original,
            alive: false,
            life: { retired: true, reviveMsLeft: 0, reviveUntil: 0 },
        }
        await flushPromises()
        visible.value = false
        await flushPromises()
        player.value = original
        visible.value = true
        await flushPromises()
        expect(wrapper.findAll('.hotbar-slot')[2]!.attributes('aria-label')).toContain('Пусто')
    } finally {
        wrapper.unmount()
    }
})

afterEach(() => {
    for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith('ratata:hotbar:')) sessionStorage.removeItem(key)
    }
})

it('restores manual choices and seen abilities in a fresh application in the same tab', async () => {
    const epoch = ref('world-reload')
    const initial = setup(undefined, epoch)
    try {
        await assignThird(initial.wrapper)
        await initial.observe(['spark', 'barrier', 'fireball'])
        await clickWithPointer(initial.wrapper.get('[aria-label="Очистить слот 2"]').element)
    } finally {
        initial.wrapper.unmount()
    }

    const resumed = setup(initial.player.value, epoch)
    try {
        expect(resumed.labels()).toEqual(['1: Удар ножом', '2: Пусто', '3: Искра', '4: Барьер'])
        await resumed.observe(['fireball', 'spark', 'barrier', 'chains'])
        expect(resumed.labels()).toEqual(['1: Удар ножом', '2: Оковы', '3: Искра', '4: Барьер'])
    } finally {
        resumed.wrapper.unmount()
    }
})

it('uses the new player and world identity when snapshots arrive together', async () => {
    const epoch = ref('world-old')
    const { wrapper, player, original, labels } = setup(undefined, epoch)
    try {
        await assignThird(wrapper)
        player.value = { ...original, id: 'another-hero' }
        await flushPromises()
        expect(labels()[2]).toBe('3: Пусто')
        epoch.value = 'world-new'
        player.value = {
            ...original,
            abilities: { known: ['barrier'], cooldowns: {}, casting: null, barrier: null },
        }
        await flushPromises()
        expect(labels()).toEqual(['1: Удар ножом', '2: Барьер', '3: Пусто', '4: Пусто'])
        epoch.value = 'world-old'
        player.value = original
        await flushPromises()
        expect(labels()).toEqual(['1: Удар ножом', '2: Искра', '3: Искра', '4: Пусто'])
    } finally {
        wrapper.unmount()
    }
})

it('removes persisted presets on final defeat before the retired snapshot arrives', async () => {
    const epoch = ref('world-death')
    const initial = setup(undefined, epoch)
    try {
        await assignThird(initial.wrapper)
        initial.session.clear()
        await initial.observe(['spark', 'barrier'])
    } finally {
        initial.wrapper.unmount()
    }

    const resumed = setup(initial.original, epoch)
    try {
        expect(resumed.labels()).toEqual(['1: Удар ножом', '2: Искра', '3: Пусто', '4: Пусто'])
    } finally {
        resumed.wrapper.unmount()
    }
})
