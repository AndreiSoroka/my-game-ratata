import type { ClientMessage } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { type ChatInputState, chatMaxLength } from '../runtime/chatInput'
import { RuntimeChatInput } from '../runtime/runtimeChatInput'
import { handleRuntimeKeyDown } from '../runtime/runtimeKeyDown'
import { RuntimeMovementControls } from '../runtime/runtimeMovementControls'
import type { RatataGameOptions } from '../runtime/runtimeOptions'
import GameChat from './GameChat.vue'
import { focusWorldInput } from './keyboardOwnership'

const inactiveDraft = {
    active: false,
    draft: '',
    maxLength: chatMaxLength,
} satisfies ChatInputState

function key(target: HTMLElement, code: string, value = code): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
        code,
        key: value,
        bubbles: true,
        cancelable: true,
    })
    target.dispatchEvent(event)
    return event
}

it('passes only WASD from history and its tabs, retaining native scrolling and confirmation ownership', async () => {
    const wrapper = mount(GameChat, {
        props: { entries: [], state: inactiveDraft },
        attachTo: document.body,
    })
    const heard = vi.fn<(event: KeyboardEvent) => void>()
    window.addEventListener('keydown', heard)
    try {
        const history = wrapper.get('ol').element
        history.focus()
        expect(key(history, 'ArrowUp').defaultPrevented).toBe(false)
        key(history, 'KeyW', 'ц')
        expect(heard).toHaveBeenCalledOnce()
        for (const code of [
            'ArrowUp',
            'ArrowDown',
            'PageUp',
            'PageDown',
            'Enter',
            'KeyQ',
            'KeyE',
            'KeyF',
            'Digit1',
        ]) {
            const event = key(history, code)
            expect(event.defaultPrevented).toBe(false)
        }
        expect(heard).toHaveBeenCalledOnce()
        const tab = wrapper.get('button').element
        tab.focus()
        key(tab, 'KeyD', 'в')
        expect(heard).toHaveBeenCalledTimes(2)
        key(tab, 'Enter', 'Enter')
        expect(heard).toHaveBeenCalledTimes(2)
    } finally {
        window.removeEventListener('keydown', heard)
        wrapper.unmount()
    }
})

it('finishes a public draft from history focus without moving, then returns to canvas immediately', async () => {
    const canvas = document.createElement('canvas')
    canvas.dataset.gameCanvas = 'true'
    canvas.tabIndex = 0
    document.body.append(canvas)
    const wrapper = mount(GameChat, {
        props: { entries: [], state: inactiveDraft },
        attrs: { onDraft: (text: string) => chat.setDraft(text) },
        attachTo: document.body,
    })
    const send = vi.fn<(command: ClientMessage) => void>()
    const move = vi.fn<(code: string) => void>()
    const chat = new RuntimeChatInput(
        (state) => {
            void wrapper.setProps({ state })
        },
        focusWorldInput,
        undefined,
        () => focusWorldInput(true)
    )
    const actions = {
        chat,
        send,
        move,
        movement: new RuntimeMovementControls(send),
        options: {} as RatataGameOptions,
        playUi: vi.fn<() => void>(),
        stopMovement: vi.fn<() => void>(),
    }
    const listener = (event: KeyboardEvent) => handleRuntimeKeyDown(event, actions)
    window.addEventListener('keydown', listener)
    try {
        canvas.focus()
        key(canvas, 'Enter', 'Enter')
        await wrapper.vm.$nextTick()
        const editor = wrapper.get<HTMLInputElement>('input[data-public-chat-input]')
        expect(document.activeElement).toBe(editor.element)
        expect(key(editor.element, 'KeyW', 'ц').defaultPrevented).toBe(false)
        await editor.setValue('Привет')
        const composing = new KeyboardEvent('keydown', {
            code: 'Enter',
            key: 'Enter',
            isComposing: true,
            bubbles: true,
            cancelable: true,
        })
        editor.element.dispatchEvent(composing)
        expect(composing.defaultPrevented).toBe(false)
        expect(chat.isActive).toBe(true)
        expect(send).not.toHaveBeenCalled()
        const history = wrapper.get('ol').element
        history.focus()
        key(history, 'KeyW', 'ц')
        expect(move).not.toHaveBeenCalled()
        key(history, 'Enter', 'Enter')
        await wrapper.vm.$nextTick()
        expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'chat', text: 'Привет' })
        expect(document.activeElement).toBe(canvas)
        key(canvas, 'KeyD', 'в')
        expect(move).toHaveBeenCalledExactlyOnceWith('KeyD')
    } finally {
        window.removeEventListener('keydown', listener)
        chat.cancel()
        wrapper.unmount()
        canvas.remove()
    }
})

it.each(['input', 'textarea', 'div'] as const)(
    'keeps a foreign %s editor authoritative over a pending public draft',
    (tag) => {
        const editor = document.createElement(tag)
        if (tag === 'div') editor.setAttribute('contenteditable', 'true')
        editor.tabIndex = 0
        document.body.append(editor)
        const send = vi.fn<(command: ClientMessage) => void>()
        const move = vi.fn<(code: string) => void>()
        const chat = new RuntimeChatInput(
            vi.fn<(state: ChatInputState) => void>(),
            undefined,
            undefined,
            focusWorldInput
        )
        chat.handleKey(
            new KeyboardEvent('keydown', { key: 'Enter' }),
            vi.fn<(text: string) => void>()
        )
        const actions = {
            chat,
            send,
            move,
            movement: new RuntimeMovementControls(send),
            options: {} as RatataGameOptions,
            playUi: vi.fn<() => void>(),
            stopMovement: vi.fn<() => void>(),
        }
        const listener = (event: KeyboardEvent) => handleRuntimeKeyDown(event, actions)
        window.addEventListener('keydown', listener)
        try {
            editor.focus()
            expect(key(editor, 'KeyW', 'ц').defaultPrevented).toBe(false)
            expect(move).not.toHaveBeenCalled()
            expect(send).not.toHaveBeenCalled()
            chat.cancel()
            expect(document.activeElement).toBe(editor)
        } finally {
            window.removeEventListener('keydown', listener)
            editor.remove()
        }
    }
)
