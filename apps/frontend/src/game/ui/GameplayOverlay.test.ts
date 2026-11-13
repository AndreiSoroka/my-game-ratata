import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import GameplayOverlay from './GameplayOverlay.vue'

describe('keyboard combat target controls', () => {
    it('cycles hostile and friendly separately, selects self, toggles exact target and clears with Escape', async () => {
        const player = characterFixture('self'),
            friend = characterFixture('friend'),
            enemy = characterFixture('enemy', { faction: 'monsters', relationship: 'hostile' })
        const send = vi.fn<() => void>(),
            game = { sendCommand: send, setCombatTarget: vi.fn<() => void>() }
        const wrapper = mount(GameplayOverlay, {
            props: {
                player,
                characters: [player, friend, enemy],
                snapshot: worldFixture([player, friend, enemy]),
                blocked: false,
                game: game as never,
            },
            global: { stubs: { SpeechBubbles: true } },
        })
        const press = (code: string, shiftKey = false) =>
            window.dispatchEvent(new KeyboardEvent('keydown', { code, shiftKey, bubbles: true }))
        try {
            press('KeyT')
            await wrapper.vm.$nextTick()
            expect(wrapper.vm.selectedId).toBe('enemy')
            press('KeyQ')
            expect(send).toHaveBeenLastCalledWith({ type: 'auto_attack', targetId: 'enemy' })
            press('KeyT', true)
            await wrapper.vm.$nextTick()
            expect(wrapper.vm.selectedId).toBe('friend')
            press('KeyF')
            await wrapper.vm.$nextTick()
            expect(wrapper.vm.selectedId).toBe('self')
            press('KeyQ')
            expect(send).toHaveBeenLastCalledWith({ type: 'attack' })
            press('Escape')
            expect(send).toHaveBeenLastCalledWith({ type: 'cancel_control' })
            expect(wrapper.vm.selectedId).toBeUndefined()
            await wrapper.setProps({ blocked: true })
            send.mockClear()
            press('KeyT')
            press('KeyQ')
            expect(send).not.toHaveBeenCalled()
        } finally {
            wrapper.unmount()
        }
    })
    it('keeps server follow active when its target crosses out of view, but clears a dead hostile focus', async () => {
        const friend = characterFixture('friend')
        const player = characterFixture('self', {
            control: { mode: 'follow', targetId: friend.id },
        })
        const enemy = characterFixture('enemy', { relationship: 'hostile' })
        const send = vi.fn<() => void>()
        const wrapper = mount(GameplayOverlay, {
            props: {
                player,
                characters: [player, friend, enemy],
                snapshot: worldFixture([player, friend, enemy]),
                blocked: false,
                game: { sendCommand: send, setCombatTarget: vi.fn<() => void>() } as never,
            },
            global: { stubs: { SpeechBubbles: true } },
        })
        try {
            wrapper.vm.select(friend.id)
            await wrapper.vm.$nextTick()
            send.mockClear()
            await wrapper.setProps({ characters: [player, enemy] })
            expect(wrapper.vm.selectedId).toBeUndefined()
            expect(send).not.toHaveBeenCalled()
            wrapper.vm.select(enemy.id)
            await wrapper.vm.$nextTick()
            await wrapper.setProps({ characters: [player, { ...enemy, alive: false }] })
            expect(wrapper.vm.selectedId).toBeUndefined()
            expect(send).toHaveBeenCalledWith({ type: 'cancel_control' })
        } finally {
            wrapper.unmount()
        }
    })
    it('retains a dead ally for resurrection and releases controls on stun and blur', async () => {
        const player = characterFixture('self')
        const friend = characterFixture('friend', { alive: false })
        const send = vi.fn<() => void>()
        const wrapper = mount(GameplayOverlay, {
            props: {
                player,
                characters: [player, friend],
                snapshot: worldFixture([player, friend]),
                blocked: false,
                game: { sendCommand: send, setCombatTarget: vi.fn<() => void>() } as never,
            },
            global: { stubs: { SpeechBubbles: true } },
        })
        try {
            wrapper.vm.select(friend.id)
            await wrapper.setProps({ characters: [player, { ...friend }] })
            expect(wrapper.vm.selectedId).toBe(friend.id)
            await wrapper.setProps({
                player: { ...player, cooldowns: { ...player.cooldowns, stunMsLeft: 900 } },
            })
            expect(send).toHaveBeenLastCalledWith({ type: 'cancel_control' })
            send.mockClear()
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }))
            expect(send).not.toHaveBeenCalled()
            window.dispatchEvent(new Event('blur'))
            expect(send).toHaveBeenLastCalledWith({ type: 'cancel_control' })
        } finally {
            wrapper.unmount()
        }
    })
})
