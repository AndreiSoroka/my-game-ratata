import { describe, expect, it, vi } from 'vitest'

import { handleRuntimeShortcut } from './runtimeShortcuts'

const key = (code: string, repeat = false) =>
    new KeyboardEvent('keydown', { code, repeat, cancelable: true })

describe('world context shortcut', () => {
    it('uses physical P for the character menu and ignores held repeats', () => {
        const character = vi.fn<() => void>()
        const noOp = () => undefined
        const actions = { inventory: noOp, pickup: noOp, context: undefined, character }
        handleRuntimeShortcut(
            new KeyboardEvent('keydown', { code: 'KeyP', key: 'з', repeat: true }),
            actions
        )
        expect(character).not.toHaveBeenCalled()
        handleRuntimeShortcut(new KeyboardEvent('keydown', { code: 'KeyP', key: 'з' }), actions)
        expect(character).toHaveBeenCalledOnce()
    })
    it('opens only on a fresh F and leaves E inactive', () => {
        const context = vi.fn<() => void>()
        const pickup = vi.fn<() => void>()
        const noOp = () => undefined
        const actions = { inventory: noOp, pickup, context }
        const removedShortcut = key('KeyE')
        expect(handleRuntimeShortcut(removedShortcut, actions)).toBe(false)
        expect(removedShortcut.defaultPrevented).toBe(false)
        expect(handleRuntimeShortcut(key('KeyF', true), actions)).toBe(true)
        expect(context).not.toHaveBeenCalled()
        const fresh = key('KeyF')
        expect(handleRuntimeShortcut(fresh, actions)).toBe(true)
        expect(fresh.defaultPrevented).toBe(true)
        expect(context).toHaveBeenCalledOnce()
        expect(pickup).not.toHaveBeenCalled()
    })
    it('keeps F pickup fallback when no context menu is installed', () => {
        const pickup = vi.fn<() => void>()
        const noOp = () => undefined
        const actions = { inventory: noOp, pickup, context: undefined }
        expect(handleRuntimeShortcut(key('KeyE'), actions)).toBe(false)
        expect(pickup).not.toHaveBeenCalled()
        handleRuntimeShortcut(key('KeyF'), actions)
        expect(pickup).toHaveBeenCalledOnce()
    })
})
