import type { SpeechActivityCommand } from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { SpeechActivityEmitter } from './speechActivityEmitter'

afterEach(() => vi.useRealTimers())
it('sends bounded presence without drafts, expires idle input and gives new typing a new scope', () => {
    vi.useFakeTimers()
    const send = vi.fn<(message: SpeechActivityCommand) => void>()
    const emitter = new SpeechActivityEmitter(send, { channel: 'say' })
    emitter.input(true)
    const first = send.mock.calls[0]![0].activityId
    for (let index = 0; index < 10; index += 1) emitter.input(true)
    expect(send).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(3000)
    expect(send.mock.calls.map(([message]) => message.active)).toEqual([true, true, true, false])
    expect(send.mock.calls.every(([message]) => !('text' in message))).toBe(true)
    emitter.input(true)
    expect(send.mock.calls.at(-1)![0].activityId).not.toBe(first)
    emitter.stop()
    const calls = send.mock.calls.length
    vi.advanceTimersByTime(5000)
    expect(send).toHaveBeenCalledTimes(calls)
})
