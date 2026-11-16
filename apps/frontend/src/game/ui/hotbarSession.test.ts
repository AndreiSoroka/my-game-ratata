import { flushPromises, mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { defineComponent, ref } from 'vue'

import { characterFixture } from '../testing/characterFixture'
import ActionHotbar from './ActionHotbar.vue'
import { provideHotbarSession } from './hotbarSession'

function setup() {
    const original = characterFixture('living-hero', {
        heroClass: 'arcanist',
        abilities: { known: ['spark'], cooldowns: {}, casting: null, barrier: null },
    })
    const player = ref(original),
        visible = ref(true)
    const wrapper = mount(
        defineComponent({
            components: { ActionHotbar },
            setup() {
                provideHotbarSession()
                return { player, visible }
            },
            template:
                '<ActionHotbar v-if="visible" :player="player" :characters="[player]" :blocked="false" />',
        })
    )
    return { wrapper, player, visible, original }
}
async function assignThird(wrapper: ReturnType<typeof setup>['wrapper']): Promise<void> {
    await wrapper.getComponent(ActionHotbar).vm.edit(2)
    await wrapper.get('.hotbar-picker button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.hotbar-slot')[2]!.attributes('aria-label')).toContain('Искра')
}
it('retains manual bindings across a runtime remount for the same living identity', async () => {
    const { wrapper, visible } = setup()
    try {
        await assignThird(wrapper)
        visible.value = false
        await flushPromises()
        visible.value = true
        await flushPromises()
        expect(wrapper.findAll('.hotbar-slot')[2]!.attributes('aria-label')).toContain('Искра')
    } finally {
        wrapper.unmount()
    }
})
it('uses fresh presets for a different identity and for reused ids with different identity data', async () => {
    const { wrapper, player, original } = setup()
    try {
        await assignThird(wrapper)
        player.value = { ...original, id: 'another-hero' }
        await flushPromises()
        expect(wrapper.findAll('.hotbar-slot')[2]!.attributes('aria-label')).toContain('Пусто')
        player.value = { ...original, nickname: 'New owner of reused id' }
        await flushPromises()
        expect(wrapper.findAll('.hotbar-slot')[2]!.attributes('aria-label')).toContain('Пусто')
        player.value = original
        await flushPromises()
        expect(wrapper.findAll('.hotbar-slot')[2]!.attributes('aria-label')).toContain('Искра')
    } finally {
        wrapper.unmount()
    }
})
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
