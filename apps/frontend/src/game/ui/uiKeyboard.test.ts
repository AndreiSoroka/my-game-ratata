import { describe, expect, it, vi } from 'vitest'

import { activateFocusedButton } from './uiKeyboard'

describe('focused-button confirmation', () => {
    it('never hijacks Enter in an input and activates a focused button once per fresh physical E', () => {
        const panel = document.createElement('section')
        const input = document.createElement('input')
        const button = document.createElement('button')
        panel.append(input, button)
        document.body.append(panel)
        const clicked = vi.fn<(event: MouseEvent) => void>()
        button.addEventListener('click', clicked)
        try {
            input.focus()
            const enter = new KeyboardEvent('keydown', {
                code: 'Enter',
                key: 'Enter',
                cancelable: true,
            })
            expect(activateFocusedButton(enter, panel)).toBe(false)
            expect(enter.defaultPrevented).toBe(false)
            button.focus()
            const removedShortcut = new KeyboardEvent('keydown', {
                code: 'KeyF',
                key: 'f',
                cancelable: true,
            })
            expect(activateFocusedButton(removedShortcut, panel)).toBe(false)
            expect(removedShortcut.defaultPrevented).toBe(false)
            expect(clicked).not.toHaveBeenCalled()
            const repeated = new KeyboardEvent('keydown', {
                code: 'KeyE',
                key: 'у',
                repeat: true,
                cancelable: true,
            })
            expect(activateFocusedButton(repeated, panel)).toBe(true)
            expect(clicked).not.toHaveBeenCalled()
            const fresh = new KeyboardEvent('keydown', { code: 'KeyE', key: 'у', cancelable: true })
            expect(activateFocusedButton(fresh, panel)).toBe(true)
            expect(fresh.defaultPrevented).toBe(true)
            expect(clicked).toHaveBeenCalledOnce()
        } finally {
            panel.remove()
        }
    })
})
