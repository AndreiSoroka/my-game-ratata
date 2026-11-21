import { expect, it, vi } from 'vitest'

import type { ChatInputState } from './chatInput'
import { RuntimeChatInput } from './runtimeChatInput'

function key(key: string, repeat = false): KeyboardEvent {
    return new KeyboardEvent('keydown', { key, repeat, cancelable: true })
}

it('ignores held Enter, submits once and does not reopen from repeated keydowns', () => {
    const states: ChatInputState[] = []
    const send = vi.fn<(text: string) => void>()
    const ended = vi.fn<() => void>()
    const chat = new RuntimeChatInput((state) => states.push(state), undefined, undefined, ended)
    chat.handleKey(key('Enter'), send)
    chat.handleKey(key('Enter', true), send)
    expect(chat.isActive).toBe(true)
    chat.setDraft('ц')
    chat.handleKey(key('Enter'), send)
    chat.handleKey(key('Enter', true), send)
    expect(send).toHaveBeenCalledExactlyOnceWith('ц')
    expect(chat.isActive).toBe(false)
    expect(states.at(-1)).toMatchObject({ active: false, draft: '' })
    expect(ended).toHaveBeenCalledOnce()
})

it('preserves a suspended draft until resuming, while explicit cancellation clears it', () => {
    const states: ChatInputState[] = []
    const send = vi.fn<(text: string) => void>()
    const chat = new RuntimeChatInput((state) => states.push(state))
    chat.handleKey(key('Enter'), send)
    chat.setDraft('я')
    chat.suspend()
    expect(states.at(-1)).toMatchObject({ active: false, draft: 'я' })
    chat.handleKey(key('Enter'), send)
    expect(states.at(-1)).toMatchObject({ active: true, draft: 'я' })
    chat.handleKey(key('Escape'), send)
    chat.handleKey(key('Enter'), send)
    expect(states.at(-1)).toMatchObject({ active: true, draft: '' })
    expect(send).not.toHaveBeenCalled()
    chat.cancel()
})

it('leaves native editing keys alone and ignores draft updates after closing', () => {
    const states: ChatInputState[] = []
    const send = vi.fn<(text: string) => void>()
    const chat = new RuntimeChatInput((state) => states.push(state))
    chat.handleKey(key('Enter'), send)
    chat.setDraft('Привет')
    const nativeKey = key('Backspace')
    expect(chat.handleKey(nativeKey, send)).toBe(false)
    expect(nativeKey.defaultPrevented).toBe(false)
    expect(states.at(-1)).toMatchObject({ active: true, draft: 'Привет' })
    chat.handleKey(key('Escape'), send)
    chat.setDraft('Запоздалый ввод')
    expect(states.at(-1)).toMatchObject({ active: false, draft: '' })
    expect(send).not.toHaveBeenCalled()
})
