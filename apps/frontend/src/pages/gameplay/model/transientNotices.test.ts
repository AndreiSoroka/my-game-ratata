import { afterEach, describe, expect, it, vi } from 'vitest'

import { createTransientNotices } from './transientNotices'

afterEach(() => {
    vi.useRealTimers()
})

describe('transient action feedback', () => {
    it('expires while identical snapshots continue and does not replay the consumed receipt', () => {
        vi.useFakeTimers()
        const publish = vi.fn<(text: string) => void>()
        const notices = createTransientNotices(publish)
        const receipt = { notice: 'Дерево +1, волокно +1', noticeId: 1 }
        notices.observe('adventure', receipt)
        for (let frame = 0; frame < 100; frame++) {
            vi.advanceTimersByTime(50)
            notices.observe('adventure', { ...receipt })
        }
        expect(publish.mock.calls).toEqual([[receipt.notice], ['']])
        vi.advanceTimersByTime(10_000)
        notices.observe('adventure', receipt)
        expect(publish).toHaveBeenCalledTimes(2)
    })
    it('shows the same text again for a new real receipt and replaces an older deadline', () => {
        vi.useFakeTimers()
        const publish = vi.fn<(text: string) => void>()
        const notices = createTransientNotices(publish)
        notices.observe('adventure', { notice: 'Собрано +1', noticeId: 1 })
        vi.advanceTimersByTime(4_000)
        notices.observe('adventure', { notice: 'Собрано +1', noticeId: 2 })
        vi.advanceTimersByTime(1_000)
        expect(publish.mock.calls).toEqual([['Собрано +1'], ['Собрано +1']])
        vi.advanceTimersByTime(4_000)
        expect(publish).toHaveBeenLastCalledWith('')
    })
    it('shares one toast between receipts and events, then clears timers and receipts on a new life', () => {
        vi.useFakeTimers()
        const publish = vi.fn<(text: string) => void>()
        const notices = createTransientNotices(publish)
        notices.observe('party', { notice: 'Приглашение отправлено', noticeId: 1 })
        vi.advanceTimersByTime(4_000)
        notices.show('Не хватает сил для рывка')
        vi.advanceTimersByTime(1_000)
        expect(publish).toHaveBeenLastCalledWith('Не хватает сил для рывка')
        notices.reset()
        const calls = publish.mock.calls.length
        vi.advanceTimersByTime(10_000)
        expect(publish).toHaveBeenCalledTimes(calls)
        expect(publish).toHaveBeenLastCalledWith('')
        notices.observe('party', { notice: 'Приглашение отправлено', noticeId: 1 })
        expect(publish).toHaveBeenLastCalledWith('Приглашение отправлено')
        notices.reset()
    })
})
