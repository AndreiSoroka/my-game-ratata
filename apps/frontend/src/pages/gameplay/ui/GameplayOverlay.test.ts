import type { CharacterControlSnapshot } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { automationFixture, scenarioRunFixture } from '../../../game/testing/automationFixture'
import { characterFixture, worldFixture } from '../../../game/testing/characterFixture'
import { graveFixture } from '../../../game/testing/graveFixture'
import GameplayOverlay from './GameplayOverlay.vue'

function oneAttack(targetId: string) {
    return { type: 'auto_action', action: { kind: 'attack', targetId, once: true } } as const
}

it('moves visual focus with the temporary target and gives the explicit choice priority', async () => {
    const player = characterFixture('self')
    const first = characterFixture('first', { position: { x: 18, y: 0 } })
    const second = characterFixture('second', { position: { x: -18, y: 0 } })
    const characters = [player, first, second]
    const sendCommand = vi.fn<() => void>()
    const setCombatTarget = vi.fn<() => void>()
    const wrapper = mount(GameplayOverlay, {
        props: {
            player,
            characters,
            snapshot: worldFixture(characters),
            blocked: false,
            nearbyTargetKey: `character:${first.id}`,
            game: { sendCommand, setCombatTarget } as never,
        },
        global: { stubs: { SpeechBubbles: true } },
    })
    try {
        expect(wrapper.vm.selectedKey).toBeUndefined()
        expect(setCombatTarget).toHaveBeenLastCalledWith(
            expect.objectContaining({ key: `character:${first.id}` })
        )
        await wrapper.setProps({ nearbyTargetKey: `character:${second.id}` })
        expect(setCombatTarget).toHaveBeenLastCalledWith(
            expect.objectContaining({ key: `character:${second.id}` })
        )
        expect(sendCommand).not.toHaveBeenCalled()

        wrapper.vm.select(first.id)
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.selectedKey).toBe(`character:${first.id}`)
        expect(setCombatTarget).toHaveBeenLastCalledWith(
            expect.objectContaining({ key: `character:${first.id}` })
        )
        await wrapper.setProps({ nearbyTargetKey: undefined })
        expect(setCombatTarget).toHaveBeenLastCalledWith(
            expect.objectContaining({ key: `character:${first.id}` })
        )

        wrapper.vm.cancel(true)
        await wrapper.vm.$nextTick()
        expect(setCombatTarget).toHaveBeenLastCalledWith(undefined)
    } finally {
        wrapper.unmount()
    }
})

it('cycles non-hostile targets and enemies separately and toggles self with Q', async () => {
    const player = characterFixture('self'),
        friend = characterFixture('friend', { position: { x: 40, y: 0 } }),
        enemy = characterFixture('enemy', {
            faction: 'monsters',
            relationship: 'hostile',
            position: { x: 24, y: 0 },
        }),
        farEnemy = characterFixture('far enemy', {
            faction: 'monsters',
            relationship: 'hostile',
            position: { x: 56, y: 0 },
        }),
        dummy = characterFixture('dummy', {
            position: { x: 32, y: 0 },
            trainingTarget: { areaId: 'yard' },
        })
    const characters = [player, friend, enemy, farEnemy, dummy]
    const snapshot = {
        ...worldFixture(characters),
        items: [{ id: 'apple', itemId: 'food' as const, position: { x: 8, y: 0 } }],
    }
    const send = vi.fn<() => void>(),
        game = {
            sendCommand: send,
            setCombatTarget: vi.fn<() => void>(),
            isInteractionVisible: () => true,
        }
    const wrapper = mount(GameplayOverlay, {
        props: {
            player,
            characters,
            snapshot,
            blocked: false,
            game: game as never,
        },
        global: { stubs: { SpeechBubbles: true } },
    })
    const press = (code: string, shiftKey = false) =>
        window.dispatchEvent(new KeyboardEvent('keydown', { code, shiftKey, bubbles: true }))
    try {
        press('Tab')
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.selectedKey).toBe('item:apple')
        expect(wrapper.vm.selectedId).toBeUndefined()
        expect(wrapper.get('.hotbar').attributes('data-selected-target-name')).toBe('Яблоко')
        expect(game.setCombatTarget).toHaveBeenLastCalledWith(
            expect.objectContaining({ key: 'item:apple', name: 'Яблоко' })
        )
        press('KeyE')
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.selectedId).toBe('enemy')
        press('Digit1')
        expect(send).toHaveBeenLastCalledWith(oneAttack(enemy.id))
        press('Digit1')
        expect(send).toHaveBeenLastCalledWith({
            type: 'auto_action',
            action: { kind: 'attack', targetId: 'enemy' },
        })
        press('KeyE')
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.selectedId).toBe(farEnemy.id)
        press('KeyE', true)
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.selectedId).toBe('enemy')
        press('Tab', true)
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.selectedId).toBe(friend.id)
        press('Tab', true)
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.selectedId).toBe(dummy.id)
        press('KeyQ')
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.selectedId).toBe('self')
        send.mockClear()
        press('KeyQ')
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.selectedId).toBeUndefined()
        expect(send).not.toHaveBeenCalled()
        press('KeyQ')
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.selectedId).toBe('self')
        expect(send).not.toHaveBeenCalled()
        press('Digit1')
        expect(send).toHaveBeenLastCalledWith({ type: 'attack' })
        press('Escape')
        expect(send).toHaveBeenLastCalledWith({ type: 'cancel_control' })
        expect(wrapper.vm.selectedId).toBeUndefined()
        await wrapper.setProps({ blocked: true })
        send.mockClear()
        press('Tab')
        press('KeyE')
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
            game: {
                sendCommand: send,
                setCombatTarget: vi.fn<() => void>(),
                isInteractionVisible: () => true,
            } as never,
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
        send.mockClear()
        await wrapper.setProps({ characters: [player, { ...enemy, alive: false }] })
        expect(wrapper.vm.selectedId).toBeUndefined()
        expect(send).not.toHaveBeenCalled()
    } finally {
        wrapper.unmount()
    }
})

it('uses the same distance and viewport guard for direct selection, cycling and retained targets', async () => {
    const player = characterFixture('self')
    const near = characterFixture('near', { position: { x: 80, y: 0 } })
    const far = characterFixture('far', { position: { x: 193, y: 0 } })
    const hidden = characterFixture('offscreen', { position: { x: 40, y: 0 } })
    const characters = [player, near, far, hidden]
    const send = vi.fn<() => void>()
    let visible = true
    const wrapper = mount(GameplayOverlay, {
        props: {
            player,
            characters,
            snapshot: worldFixture(characters),
            blocked: false,
            game: {
                sendCommand: send,
                setCombatTarget: vi.fn<() => void>(),
                isInteractionVisible: () => true,
                isSelectionVisible: (target: { id: string }) => visible && target.id !== hidden.id,
            } as never,
        },
        global: { stubs: { SpeechBubbles: true } },
    })
    try {
        expect(wrapper.vm.select(far.id)).toBe(false)
        expect(wrapper.vm.select(hidden.id)).toBe(false)
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab' }))
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.selectedId).toBe(near.id)
        send.mockClear()
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))
        expect(wrapper.vm.selectedId).toBe(near.id)
        expect(send).not.toHaveBeenCalled()
        visible = false
        await wrapper.setProps({ snapshot: { ...worldFixture(characters), tick: 2 } })
        expect(wrapper.vm.selectedKey).toBeUndefined()
        expect(send).not.toHaveBeenCalled()
        expect(wrapper.vm.select(near.id, true)).toBe(false)
        expect(wrapper.emitted('interact')).toBeUndefined()
    } finally {
        wrapper.unmount()
    }
})

it.each(['none', 'route', 'follow', 'attack', 'action'] as const)(
    'clears an offscreen selection while preserving %s movement and only cancelling its targeted combat',
    async (mode) => {
        const enemy = characterFixture('enemy', { faction: 'monsters' })
        const control: CharacterControlSnapshot = {
            mode,
            targetId: mode === 'route' || mode === 'none' ? null : enemy.id,
            route:
                mode === 'route'
                    ? {
                          locationId: 'map-2-2',
                          points: [{ number: 1, position: { x: 920, y: 792 } }],
                          waiting: null,
                      }
                    : undefined,
            action: mode === 'action' ? { kind: 'attack', targetId: enemy.id } : undefined,
        }
        const player = characterFixture('self', { control, velocity: { x: 110, y: 0 } })
        const send = vi.fn<() => void>()
        let visible = true
        const wrapper = mount(GameplayOverlay, {
            props: {
                player,
                characters: [player, enemy],
                snapshot: worldFixture([player, enemy]),
                blocked: false,
                game: {
                    sendCommand: send,
                    setCombatTarget: vi.fn<() => void>(),
                    isInteractionVisible: () => true,
                    isSelectionVisible: () => visible,
                } as never,
            },
            global: { stubs: { SpeechBubbles: true } },
        })
        try {
            wrapper.vm.select(enemy.id)
            await wrapper.vm.$nextTick()
            send.mockClear()
            visible = false
            await wrapper.setProps({ snapshot: { ...worldFixture([player, enemy]), tick: 2 } })
            expect(wrapper.vm.selectedKey).toBeUndefined()
            expect(send.mock.calls).toEqual(
                mode === 'attack' || mode === 'action' ? [[{ type: 'cancel_control' }]] : []
            )
        } finally {
            wrapper.unmount()
        }
    }
)

it('does not cancel an automatic action aimed at a different target when selection leaves view', async () => {
    const enemy = characterFixture('enemy', { faction: 'monsters' })
    const player = characterFixture('self', {
        control: {
            mode: 'action',
            targetId: 'other',
            action: { kind: 'attack', targetId: 'other' },
        },
    })
    const send = vi.fn<() => void>()
    let visible = true
    const wrapper = mount(GameplayOverlay, {
        props: {
            player,
            characters: [player, enemy],
            snapshot: worldFixture([player, enemy]),
            blocked: false,
            game: {
                sendCommand: send,
                setCombatTarget: vi.fn<() => void>(),
                isInteractionVisible: () => true,
                isSelectionVisible: () => visible,
            } as never,
        },
        global: { stubs: { SpeechBubbles: true } },
    })
    try {
        wrapper.vm.select(enemy.id)
        await wrapper.vm.$nextTick()
        send.mockClear()
        visible = false
        await wrapper.setProps({ snapshot: { ...worldFixture([player, enemy]), tick: 2 } })
        expect(wrapper.vm.selectedKey).toBeUndefined()
        expect(send).not.toHaveBeenCalled()
    } finally {
        wrapper.unmount()
    }
})

it.each(['route', 'action'] as const)(
    'resets a changed grave phase without releasing %s control',
    async (mode) => {
        const grave = graveFixture()
        const player = characterFixture('self', {
            control: {
                mode,
                targetId: null,
                action:
                    mode === 'action'
                        ? { kind: 'attack', target: { kind: 'grave', id: grave.id } }
                        : undefined,
            },
        })
        const snapshot = { ...worldFixture([player]), graves: [grave] }
        const send = vi.fn<() => void>()
        const wrapper = mount(GameplayOverlay, {
            props: {
                player,
                characters: [player],
                snapshot,
                blocked: false,
                game: {
                    sendCommand: send,
                    setCombatTarget: vi.fn<() => void>(),
                    isInteractionVisible: () => true,
                } as never,
            },
            global: { stubs: { SpeechBubbles: true } },
        })
        try {
            wrapper.vm.selectGrave(grave.id)
            await wrapper.vm.$nextTick()
            send.mockClear()
            await wrapper.setProps({
                snapshot: { ...snapshot, graves: [{ ...grave, phase: 'ruined' }] },
            })
            expect(wrapper.vm.selectedGraveId).toBe(grave.id)
            expect(send.mock.calls).toEqual(mode === 'action' ? [[{ type: 'cancel_control' }]] : [])
        } finally {
            wrapper.unmount()
        }
    }
)
it('retains a dead ally for resurrection and releases controls on stun and blur', async () => {
    const player = characterFixture('self')
    const friend = characterFixture('friend', {
        alive: false,
        life: { retired: false, reviveMsLeft: 30_000, reviveUntil: 130_000 },
    })
    const send = vi.fn<() => void>()
    const wrapper = mount(GameplayOverlay, {
        props: {
            player,
            characters: [player, friend],
            snapshot: worldFixture([player, friend]),
            blocked: false,
            game: {
                sendCommand: send,
                setCombatTarget: vi.fn<() => void>(),
                isInteractionVisible: () => true,
            } as never,
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
        expect(send).toHaveBeenLastCalledWith({ type: 'release_input' })
        send.mockClear()
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }))
        expect(send).not.toHaveBeenCalled()
        window.dispatchEvent(new Event('blur'))
        expect(send).toHaveBeenLastCalledWith({ type: 'release_input' })
    } finally {
        wrapper.unmount()
    }
})

it('ignores held hotbar and selection keys, clears gestures on movement, and cancels when target or menu changes', async () => {
    const player = characterFixture('self'),
        enemy = characterFixture('enemy', { relationship: 'hostile', faction: 'monsters' }),
        friend = characterFixture('friend')
    const send = vi.fn<() => void>()
    const wrapper = mount(GameplayOverlay, {
        props: {
            player,
            characters: [player, enemy, friend],
            snapshot: worldFixture([player, enemy, friend]),
            blocked: false,
            game: {
                sendCommand: send,
                setCombatTarget: vi.fn<() => void>(),
                isInteractionVisible: () => true,
            } as never,
        },
        global: { stubs: { SpeechBubbles: true } },
    })
    const press = (code: string, repeat = false) =>
        window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat, bubbles: true }))
    try {
        wrapper.vm.select(enemy.id)
        await wrapper.vm.$nextTick()
        send.mockClear()
        press('Digit1')
        press('Digit1', true)
        press('KeyQ', true)
        press('KeyE', true)
        press('Tab', true)
        expect(send).toHaveBeenCalledExactlyOnceWith(oneAttack(enemy.id))
        press('KeyW')
        press('Digit1')
        expect(send).toHaveBeenCalledTimes(2)
        expect(send).toHaveBeenLastCalledWith(oneAttack(enemy.id))
        press('Digit1')
        expect(send).toHaveBeenLastCalledWith({
            type: 'auto_action',
            action: { kind: 'attack', targetId: enemy.id },
        })
        await wrapper.setProps({
            player: {
                ...player,
                control: {
                    mode: 'action',
                    targetId: enemy.id,
                    action: { kind: 'attack', targetId: enemy.id },
                    waiting: 'cooldown',
                },
            },
        })
        wrapper.vm.select(friend.id)
        await wrapper.vm.$nextTick()
        expect(send).toHaveBeenLastCalledWith({ type: 'cancel_control' })
        send.mockClear()
        await wrapper.setProps({ blocked: true })
        expect(send).toHaveBeenLastCalledWith({ type: 'release_input' })
    } finally {
        wrapper.unmount()
    }
})

it('releases held input through focus loss and menus while preserving a server scenario, with Escape still explicit', async () => {
    const player = characterFixture('self')
    const enemy = characterFixture('enemy', { faction: 'monsters', relationship: 'hostile' })
    const snapshot = {
        ...worldFixture([player, enemy]),
        automation: { ...automationFixture(), run: scenarioRunFixture() },
    }
    const send = vi.fn<() => void>()
    const wrapper = mount(GameplayOverlay, {
        props: {
            player,
            snapshot,
            characters: [player, enemy],
            blocked: false,
            game: {
                sendCommand: send,
                setCombatTarget: vi.fn<() => void>(),
                isInteractionVisible: () => true,
            } as never,
        },
        global: { stubs: { SpeechBubbles: true } },
    })
    try {
        await wrapper.setProps({ blocked: true })
        window.dispatchEvent(new Event('blur'))
        expect(send.mock.calls).toEqual([[{ type: 'release_input' }], [{ type: 'release_input' }]])
        expect(snapshot.automation.run.status).toBe('running')
        await wrapper.setProps({ blocked: false })
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }))
        expect(send).toHaveBeenLastCalledWith({ type: 'cancel_control' })
    } finally {
        wrapper.unmount()
    }
})
