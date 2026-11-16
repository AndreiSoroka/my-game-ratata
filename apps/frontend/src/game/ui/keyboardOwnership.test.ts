import { describe, expect, it } from 'vitest'

import { isGameKeyboardBlocked } from '../runtime/runtimeKeyboardFocus'
import { combatKeyBlocked } from './combatTargeting'

function keyOn(element: HTMLElement, code: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true })
    element.dispatchEvent(event)
    return event
}
describe('HUD and window keyboard ownership', () => {
    it('keeps unrelated game keys available on a focused HUD button, while confirmations belong to it', () => {
        const button = document.createElement('button')
        document.body.append(button)
        try {
            button.focus()
            for (const code of [
                'KeyI',
                'KeyW',
                'KeyC',
                'KeyQ',
                'KeyE',
                'KeyT',
                'Digit1',
                'Escape',
            ]) {
                const event = keyOn(button, code)
                expect(isGameKeyboardBlocked(event)).toBe(false)
                expect(combatKeyBlocked(event, false)).toBe(false)
            }
            for (const code of ['Space', 'Enter', 'KeyF'])
                expect(isGameKeyboardBlocked(keyOn(button, code))).toBe(true)
        } finally {
            button.remove()
        }
    })
    it.each(['input', 'textarea', 'select'])('preserves %s editing', (tag) => {
        const input = document.createElement(tag)
        document.body.append(input)
        try {
            input.focus()
            for (const code of ['KeyI', 'KeyW', 'Digit1'])
                expect(isGameKeyboardBlocked(keyOn(input, code))).toBe(true)
        } finally {
            input.remove()
        }
    })
    it.each(['dialog', 'menu', 'alertdialog'])(
        'blocks world commands while a %s is visible even after focus loss',
        (role) => {
            const panel = document.createElement('section')
            panel.setAttribute('role', role)
            document.body.append(panel)
            try {
                expect(isGameKeyboardBlocked(keyOn(document.body, 'KeyI'))).toBe(true)
                expect(combatKeyBlocked(keyOn(document.body, 'Digit1'), false)).toBe(true)
            } finally {
                panel.remove()
            }
        }
    )
    it('also recognizes the journal window without depending on button focus', () => {
        const panel = document.createElement('section')
        panel.className = 'adventure-window'
        document.body.append(panel)
        try {
            expect(isGameKeyboardBlocked(keyOn(document.body, 'KeyW'))).toBe(true)
        } finally {
            panel.remove()
        }
    })
})
