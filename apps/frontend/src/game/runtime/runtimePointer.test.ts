import type { ClientMessage } from '@my-game-ratata/contracts'
import type { PointerEvent } from 'excalibur'
import { describe, expect, it, vi } from 'vitest'

import { handleRuntimePointer } from './runtimePointer'

vi.mock('excalibur', () => ({ PointerButton: { Right: 2 } }))

function pointer(shiftKey = false, button = 0): PointerEvent {
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
    it('replaces the route on an ordinary click and ignores right clicks', () => {
        const context = setup()
        handleRuntimePointer(pointer(), context)
        expect(context.send.mock.calls).toEqual([
            [{ type: 'cancel_control' }],
            [{ type: 'move_to', target: { x: 100, y: 150 } }],
        ])
        handleRuntimePointer(pointer(true, 2), context)
        expect(context.send).toHaveBeenCalledTimes(2)
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
