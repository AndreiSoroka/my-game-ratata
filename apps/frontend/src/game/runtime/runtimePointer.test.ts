import type { AdventureResourceNode, ClientMessage, WorldSnapshot } from '@my-game-ratata/contracts'
import { PointerButton, type PointerEvent } from 'excalibur'
import { describe, expect, it, vi } from 'vitest'

import { adventureFixture, characterFixture, worldFixture } from '../testing/characterFixture'
import { handleRuntimePointer } from './runtimePointer'

function pointer(shiftKey = false, button = PointerButton.Left): PointerEvent {
    return {
        button,
        worldPos: { x: 100, y: 150 },
        nativeEvent: new MouseEvent('pointerdown', { shiftKey }),
    } as unknown as PointerEvent
}

function setup() {
    const send = vi.fn<(command: ClientMessage) => void>()
    return {
        snapshot: undefined,
        playerId: 'hero',
        visible: () => true,
        plant: vi.fn<() => boolean>(() => false),
        select: vi.fn<(id: string) => void>(),
        send,
    }
}

describe('click route modifiers', () => {
    it('appends Shift clicks without cancelling the active route', () => {
        const context = setup()
        handleRuntimePointer(pointer(true), context)
        expect(context.send.mock.calls).toEqual([
            [{ type: 'move_to', target: { x: 100, y: 150 }, append: true }],
        ])
    })
    it('requests replacement atomically on an ordinary click and ignores right clicks', () => {
        const context = setup()
        handleRuntimePointer(pointer(), context)
        expect(context.send.mock.calls).toEqual([[{ type: 'move_to', target: { x: 100, y: 150 } }]])
        handleRuntimePointer(pointer(true, PointerButton.Right), context)
        expect(context.send).toHaveBeenCalledTimes(1)
    })
    it('retains planting ownership even while Shift is held', () => {
        const context = setup()
        context.plant.mockReturnValue(true)
        handleRuntimePointer(pointer(true), context)
        expect(context.plant).toHaveBeenCalledWith({ x: 100, y: 150 })
        expect(context.send).not.toHaveBeenCalled()
    })
    it('does not move or select through an open editor, while a placement tool owns map clicks', () => {
        const context = setup()
        const dialog = document.createElement('section')
        dialog.setAttribute('role', 'dialog')
        document.body.append(dialog)
        try {
            handleRuntimePointer(pointer(), context)
            expect(context.send).not.toHaveBeenCalled()
            expect(context.plant).not.toHaveBeenCalled()
            dialog.setAttribute('data-world-pointer-owner', '')
            context.plant.mockReturnValue(true)
            handleRuntimePointer(pointer(), context)
            expect(context.plant).toHaveBeenCalledExactlyOnceWith({ x: 100, y: 150 })
            expect(context.send).not.toHaveBeenCalled()
        } finally {
            dialog.remove()
        }
    })
})

it('starts only the clicked visible source, clears stumps separately, and leaves saplings for their menu', () => {
    const node: AdventureResourceNode = {
        id: 'chosen',
        source: 'tree',
        kind: 'wood',
        locationId: 'map-2-2',
        position: { x: 100, y: 150 },
        bounds: { x: 84, y: 134, width: 32, height: 32 },
        remaining: 8,
        phase: 'ready',
    }
    const context = {
        ...setup(),
        snapshot: {
            ...worldFixture([characterFixture('hero')]),
            adventure: {
                ...adventureFixture(),
                resourceNodes: [
                    node,
                    {
                        ...node,
                        id: 'neighbor',
                        position: { x: 140, y: 150 },
                        bounds: { x: 124, y: 134, width: 32, height: 32 },
                    },
                ],
            },
        } as WorldSnapshot,
        resourceVisible: () => true,
    }
    handleRuntimePointer(pointer(), context)
    expect(context.send).toHaveBeenLastCalledWith({
        type: 'auto_action',
        action: { kind: 'gather', nodeId: 'chosen', operation: 'harvest' },
    })
    node.phase = 'stump'
    node.remaining = 0
    handleRuntimePointer(pointer(), context)
    expect(context.send).toHaveBeenLastCalledWith({
        type: 'auto_action',
        action: { kind: 'gather', nodeId: 'chosen', operation: 'clear_stump' },
    })
    for (const phase of ['removed', 'growing'] as const) {
        context.send.mockClear()
        node.phase = phase
        handleRuntimePointer(pointer(), context)
        expect(
            context.send.mock.calls.flat().some((command) => command.type === 'auto_action')
        ).toBe(false)
    }
    node.phase = 'ready'
    node.remaining = 8
    context.resourceVisible = () => false
    context.send.mockClear()
    handleRuntimePointer(pointer(), context)
    expect(context.send.mock.calls.flat().some((command) => command.type === 'auto_action')).toBe(
        false
    )
})
