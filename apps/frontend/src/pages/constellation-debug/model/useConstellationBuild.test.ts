import { afterEach, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { useConstellationBuild } from './useConstellationBuild'

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => {
    scopes.splice(0).forEach((scope) => scope.stop())
    vi.useRealTimers()
})
function build() {
    vi.useFakeTimers()
    const scope = effectScope()
    scopes.push(scope)
    return scope.run(() =>
        useConstellationBuild(
            () => 'cleric',
            () => []
        )
    )!
}
it('expires cascades after four seconds and blocked attempts after six', () => {
    const state = build()
    state.toggle('prayer.revive')
    expect(state.lastCascade.value?.ids).toEqual(['prayer.revive'])
    vi.advanceTimersByTime(3999)
    expect(state.lastCascade.value).toBeDefined()
    vi.advanceTimersByTime(1)
    expect(state.lastCascade.value).toBeUndefined()
    state.toggle('prayer.harm2')
    vi.advanceTimersByTime(5999)
    expect(state.feedback.value).toBeDefined()
    vi.advanceTimersByTime(1)
    expect(state.feedback.value).toBeUndefined()
})
it('replaces the previous notice and renews equal failures with distinct receipts', () => {
    const state = build()
    state.toggle('prayer.revive')
    state.toggle('prayer.harm2')
    expect(state.lastCascade.value).toBeUndefined()
    const firstReceipt = state.feedback.value?.id
    vi.advanceTimersByTime(5000)
    state.toggle('prayer.harm2')
    expect(state.feedback.value?.id).not.toBe(firstReceipt)
    vi.advanceTimersByTime(5000)
    expect(state.feedback.value).toBeDefined()
    vi.advanceTimersByTime(1000)
    expect(state.feedback.value).toBeUndefined()
    state.toggle('prayer.harm2')
    state.toggle('prayer.harm')
    expect(state.feedback.value).toBeUndefined()
    expect(state.lastCascade.value).toBeUndefined()
})
it('preserves remaining reading time until both hover and keyboard focus leave', () => {
    const state = build()
    state.toggle('prayer.harm2')
    vi.advanceTimersByTime(1000)
    state.pauseNotice('pointer')
    state.pauseNotice('focus')
    vi.advanceTimersByTime(10000)
    state.resumeNotice('pointer')
    vi.advanceTimersByTime(10000)
    expect(state.feedback.value).toBeDefined()
    state.resumeNotice('focus')
    vi.advanceTimersByTime(4999)
    expect(state.feedback.value).toBeDefined()
    vi.advanceTimersByTime(1)
    expect(state.feedback.value).toBeUndefined()
})
it('cleans up pending timers when the atlas leaves its scope', () => {
    const state = build()
    state.toggle('prayer.harm2')
    expect(vi.getTimerCount()).toBe(1)
    scopes[0]!.stop()
    expect(vi.getTimerCount()).toBe(0)
    expect(state.feedback.value).toBeUndefined()
})
