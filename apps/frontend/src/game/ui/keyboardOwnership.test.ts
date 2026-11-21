import { describe, expect, it } from 'vitest'

import { isGameKeyboardBlocked } from '../runtime/runtimeKeyboardFocus'
import { combatKeyBlocked } from './combatTargeting'
import { publicChatOwnsKey } from './keyboardOwnership'

function keyOn(element: HTMLElement, code: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true })
    element.dispatchEvent(event)
    return event
}
describe('HUD and window keyboard ownership', () => {
    it('gives focused chat history its scroll keys without blocking the unfocused world', () => {
        const panel = document.createElement('aside')
        panel.setAttribute('data-game-input-owner', '')
        panel.dataset.worldMovement = 'wasd'
        const list = document.createElement('ol')
        list.tabIndex = 0
        panel.append(list)
        const canvas = document.createElement('canvas')
        canvas.tabIndex = 0
        document.body.append(panel, canvas)
        try {
            list.focus()
            for (const code of ['ArrowUp', 'KeyQ', 'Enter'])
                expect(isGameKeyboardBlocked(keyOn(list, code))).toBe(true)
            for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD'])
                expect(isGameKeyboardBlocked(keyOn(list, code))).toBe(false)
            canvas.focus()
            expect(isGameKeyboardBlocked(keyOn(canvas, 'KeyQ'))).toBe(false)
        } finally {
            panel.remove()
            canvas.remove()
        }
    })
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
    it('passes only physical WASD through the quest reading view and yields to editors and other dialogs', () => {
        const panel = document.createElement('section')
        panel.setAttribute('role', 'dialog')
        panel.dataset.worldMovement = 'wasd'
        const button = document.createElement('button')
        panel.append(button)
        document.body.append(panel)
        try {
            button.focus()
            for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD'])
                expect(isGameKeyboardBlocked(keyOn(button, code))).toBe(false)
            for (const code of ['KeyQ', 'KeyE', 'KeyF', 'ArrowUp', 'Digit1'])
                expect(isGameKeyboardBlocked(keyOn(button, code))).toBe(true)
            const input = document.createElement('input')
            panel.append(input)
            input.focus()
            expect(isGameKeyboardBlocked(keyOn(input, 'KeyW'))).toBe(true)
            input.remove()
            const modal = document.createElement('section')
            modal.setAttribute('role', 'dialog')
            document.body.append(modal)
            expect(isGameKeyboardBlocked(keyOn(button, 'KeyW'))).toBe(true)
            modal.remove()
        } finally {
            panel.remove()
        }
    })
})

it('passes gameplay keys through focused pointer-only buttons even inside chat history', () => {
    const panel = document.createElement('aside')
    panel.dataset.gameInputOwner = ''
    const button = document.createElement('button')
    button.dataset.worldHudButton = ''
    button.tabIndex = -1
    panel.append(button)
    document.body.append(panel)
    try {
        button.focus()
        for (const code of ['Space', 'Enter', 'KeyF', 'Digit1']) {
            expect(isGameKeyboardBlocked(keyOn(button, code))).toBe(false)
        }
        expect(publicChatOwnsKey(keyOn(button, 'Enter'))).toBe(true)
    } finally {
        panel.remove()
    }
})

it('keeps unmarked panels and foreign dialogs in control over a read-only history', () => {
    const panel = document.createElement('aside')
    panel.setAttribute('data-game-input-owner', '')
    panel.tabIndex = 0
    document.body.append(panel)
    const dialog = document.createElement('section')
    dialog.setAttribute('role', 'dialog')
    try {
        panel.focus()
        expect(isGameKeyboardBlocked(keyOn(panel, 'KeyW'))).toBe(true)
        panel.dataset.worldMovement = 'wasd'
        expect(isGameKeyboardBlocked(keyOn(panel, 'KeyW'))).toBe(false)
        document.body.append(dialog)
        expect(isGameKeyboardBlocked(keyOn(panel, 'KeyW'))).toBe(true)
    } finally {
        panel.remove()
        dialog.remove()
    }
})
