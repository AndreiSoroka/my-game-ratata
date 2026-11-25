import { describe, expect, it, vi } from 'vitest'

import { activateFocusedButton, navigatePanelFocus } from './uiKeyboard'

describe('focused-button confirmation', () => {
    it('never hijacks Enter in an input and activates a focused button once per fresh physical F', () => {
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
                code: 'KeyE',
                key: 'e',
                cancelable: true,
            })
            expect(activateFocusedButton(removedShortcut, panel)).toBe(false)
            expect(removedShortcut.defaultPrevented).toBe(false)
            expect(clicked).not.toHaveBeenCalled()
            const repeated = new KeyboardEvent('keydown', {
                code: 'KeyF',
                key: 'а',
                repeat: true,
                cancelable: true,
            })
            expect(activateFocusedButton(repeated, panel)).toBe(true)
            expect(clicked).not.toHaveBeenCalled()
            const fresh = new KeyboardEvent('keydown', { code: 'KeyF', key: 'а', cancelable: true })
            expect(activateFocusedButton(fresh, panel)).toBe(true)
            expect(fresh.defaultPrevented).toBe(true)
            expect(clicked).toHaveBeenCalledOnce()
        } finally {
            panel.remove()
        }
    })
})

it('cycles enabled controls with physical WASD and leaves text entry to the editor', () => {
    const panel = document.createElement('section')
    const first = document.createElement('button')
    const disabled = document.createElement('button')
    const next = document.createElement('button')
    const editor = document.createElement('textarea')
    disabled.disabled = true
    panel.append(first, disabled, next, editor)
    document.body.append(panel)
    panel.addEventListener('keydown', (event) => navigatePanelFocus(event, panel))
    function press(target: HTMLElement, code: string, key: string): KeyboardEvent {
        const event = new KeyboardEvent('keydown', { code, key, cancelable: true, bubbles: true })
        target.dispatchEvent(event)
        return event
    }

    try {
        first.focus()
        expect(press(first, 'KeyS', 'ы').defaultPrevented).toBe(true)
        expect(document.activeElement).toBe(next)
        press(next, 'KeyA', 'ф')
        expect(document.activeElement).toBe(first)
        press(first, 'KeyD', 'в')
        expect(document.activeElement).toBe(next)
        press(next, 'KeyW', 'ц')
        expect(document.activeElement).toBe(first)
        editor.focus()
        expect(press(editor, 'KeyW', 'ц').defaultPrevented).toBe(false)
        expect(document.activeElement).toBe(editor)
    } finally {
        panel.remove()
    }
})

it('scrolls the focused reading area with WASD and leaves its native arrows alone', () => {
    const panel = document.createElement('section')
    const area = document.createElement('div')
    const readingRegion = document.createElement('p')
    readingRegion.tabIndex = 0
    area.style.overflowY = 'auto'
    Object.defineProperty(area, 'scrollHeight', { value: 400 })
    area.append(readingRegion)
    panel.append(document.createElement('button'), area)
    document.body.append(panel)
    try {
        readingRegion.focus()
        const scroll = new KeyboardEvent('keydown', { code: 'KeyS', key: 'ы', cancelable: true })
        expect(navigatePanelFocus(scroll, panel)).toBe(true)
        expect(scroll.defaultPrevented).toBe(true)
        expect(area.scrollTop).toBe(40)
        const arrow = new KeyboardEvent('keydown', { code: 'ArrowUp', cancelable: true })
        expect(navigatePanelFocus(arrow, panel)).toBe(true)
        expect(arrow.defaultPrevented).toBe(false)
        expect(document.activeElement).toBe(readingRegion)
    } finally {
        panel.remove()
    }
})
