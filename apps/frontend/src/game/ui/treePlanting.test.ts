import type { ClientMessage, PlantTreePreview, Vector2 } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'

import type { RatataGame } from '../runtime/ratataGame'
import { characterFixture } from '../testing/characterFixture'
import ActionHotbar from './ActionHotbar.vue'
import TreePlanting from './TreePlanting.vue'

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})
it.each([0, 1, 2, 3])(
    'keeps a sapling binding in slot %i after the last real item is spent',
    async (slot) => {
        const player = characterFixture('planter', {
            inventory: [{ instanceId: 'seed', itemId: 'sapling' }],
        })
        const wrapper = mount(ActionHotbar, {
            props: { player, characters: [player], blocked: false },
        })
        try {
            wrapper.vm.assignItem(slot, 'sapling')
            await wrapper.vm.$nextTick()
            wrapper.vm.activate(slot)
            expect(wrapper.emitted('plant')).toHaveLength(1)
            expect(wrapper.emitted<[ClientMessage]>('command')).toBeUndefined()
            await wrapper.setProps({ player: { ...player, inventory: [] } })
            expect(wrapper.findAll('.hotbar-slot')[slot]!.text()).toContain('0')
            wrapper.vm.activate(slot)
            expect(wrapper.emitted('plant')).toHaveLength(2)
            expect(wrapper.findAll('.hotbar-slot')[slot]!.attributes('aria-label')).toContain(
                'Посадить дерево'
            )
        } finally {
            wrapper.unmount()
        }
    }
)
function setup() {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    let receive: ((answer: PlantTreePreview) => void) | undefined
    let pick: ((point: Vector2) => void) | undefined
    const setPlanting = vi.fn<(handler?: (point: Vector2) => void) => void>((handler) => {
        pick = handler
    })
    const previewPlanting = vi.fn<() => void>()
    const game = {
        planting: {
            set: setPlanting,
            preview: previewPlanting,
            subscribe: (listener: typeof receive) => {
                receive = listener
                return () => {
                    receive = undefined
                }
            },
        },
        projectPosition: () => undefined,
    } as unknown as RatataGame
    const player = characterFixture('planter', {
        inventory: [{ instanceId: 'seed', itemId: 'sapling' }],
    })
    const onCommand = vi.fn<(message: ClientMessage) => void>()
    const wrapper = mount(TreePlanting, {
        props: {
            game,
            player,
            location: { id: 'map-2-2', map: { tileWidth: 16, tileHeight: 16 } },
            onCommand,
        },
    })
    const latest = () =>
        wrapper
            .emitted<[ClientMessage]>('command')!
            .flat()
            .filter((command) => command.type === 'plant_tree_preview')
            .at(-1)!
    const answer = (requestId?: string) => {
        const command = latest()
        if (command.type !== 'plant_tree_preview') throw new Error('No preview request')
        receive?.({
            type: 'plant_tree_preview',
            requestId: requestId ?? command.requestId,
            locationId: 'map-2-2',
            position: command.position,
            bounds: { x: 10, y: 10, width: 32, height: 16 },
            available: true,
        })
    }
    return {
        wrapper,
        player,
        onCommand,
        setPlanting,
        previewPlanting,
        latest,
        answer,
        pick: (point: Vector2) => pick?.(point),
    }
}
it('confirms planting with a fresh physical F, keeping E and held repeats inactive', async () => {
    const { wrapper, answer } = setup()
    try {
        answer()
        await wrapper.vm.$nextTick()
        const plantCommands = () =>
            wrapper
                .emitted<[ClientMessage]>('command')!
                .flat()
                .filter((command) => command.type === 'auto_action')
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'у' }))
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'а', repeat: true }))
        expect(plantCommands()).toHaveLength(0)
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'а' }))
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'а' }))
        expect(plantCommands()).toHaveLength(1)
    } finally {
        wrapper.unmount()
    }
})
it('ignores stale replies, throttles selection, and submits exactly one pinned intention', async () => {
    const { wrapper, latest, answer, pick, previewPlanting, onCommand } = setup()
    try {
        const initial = latest()
        if (initial.type !== 'plant_tree_preview') throw new Error('No initial request')
        pick({ x: 200, y: 200 })
        pick({ x: 216, y: 200 })
        answer(initial.requestId)
        await wrapper.vm.$nextTick()
        expect(wrapper.get('button').attributes('data-available')).toBe('false')
        await vi.advanceTimersByTimeAsync(110)
        expect(wrapper.emitted<[ClientMessage]>('command')).toHaveLength(2)
        answer(initial.requestId)
        await wrapper.vm.$nextTick()
        expect(wrapper.get('button').attributes('data-available')).toBe('false')
        answer()
        await wrapper.vm.$nextTick()
        expect(wrapper.get('button').attributes('data-available')).toBe('true')
        await wrapper.get('button').trigger('click')
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }))
        expect(
            wrapper
                .emitted<[ClientMessage]>('command')!
                .flat()
                .filter((command) => command.type === 'auto_action')
        ).toHaveLength(1)
        expect(wrapper.text()).toContain('Подходим')
        expect(previewPlanting).toHaveBeenLastCalledWith({ x: 216, y: 200 }, true, {
            x: 10,
            y: 10,
            width: 32,
            height: 16,
        })
        wrapper.unmount()
        expect(
            onCommand.mock.calls.flat().some((command) => command.type === 'cancel_control')
        ).toBe(false)
    } finally {
        if (wrapper.exists()) wrapper.unmount()
    }
})
it('lets a first touch select and a second touch confirm, then Esc cancels the route', async () => {
    const { wrapper, answer, pick } = setup()
    try {
        pick({ x: 248, y: 232 })
        await vi.advanceTimersByTimeAsync(110)
        answer()
        await wrapper.vm.$nextTick()
        expect(
            wrapper
                .emitted<[ClientMessage]>('command')!
                .flat()
                .some((command) => command.type === 'auto_action')
        ).toBe(false)
        pick({ x: 248, y: 232 })
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted<[ClientMessage]>('command')!.at(-1)).toEqual([
            { type: 'auto_action', action: { kind: 'plant_tree', position: { x: 248, y: 232 } } },
        ])
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }))
        expect(wrapper.emitted<[ClientMessage]>('command')!.at(-1)).toEqual([
            { type: 'cancel_control' },
        ])
        expect(wrapper.emitted('close')).toHaveLength(1)
    } finally {
        wrapper.unmount()
    }
})

it('requires a first touch to select even the initially proposed plot', async () => {
    const { wrapper, latest, answer, pick } = setup()
    try {
        answer()
        await wrapper.vm.$nextTick()
        const command = latest()
        if (command.type !== 'plant_tree_preview') throw new Error('No preview')
        pick(command.position)
        expect(
            wrapper
                .emitted<[ClientMessage]>('command')!
                .flat()
                .some((message) => message.type === 'auto_action')
        ).toBe(false)
        pick(command.position)
        expect(
            wrapper
                .emitted<[ClientMessage]>('command')!
                .flat()
                .filter((message) => message.type === 'auto_action')
        ).toHaveLength(1)
    } finally {
        wrapper.unmount()
    }
})
