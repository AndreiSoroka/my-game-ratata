import { expect, it } from 'vitest'

import { NpcAiCallBudget } from '../src/ai/callBudget'
import { defaultNpcAiLimits } from '../src/ai/config'

const minute = 60_000
const tenMinutes = 10 * minute
const hour = 60 * minute

function spendCalls(
    budget: NpcAiCallBudget,
    count: number,
    at: number,
    background = false
): void {
    for (let index = 0; index < count; index += 1) {
        budget.spend(at + index, background)
    }
}

it('releases calls exactly one and ten minutes after they were made', () => {
    const budget = new NpcAiCallBudget(defaultNpcAiLimits)
    spendCalls(budget, 20, 0)
    expect(budget.limit(minute - 1, false)).toEqual({
        reason: 'minute_call_limit',
        until: minute,
        windowMs: minute,
    })
    expect(budget.limit(minute, false)).toBeUndefined()

    for (let index = 1; index < 5; index += 1) {
        spendCalls(budget, 20, index * minute)
    }
    expect(budget.limit(4 * minute + 19, false)).toEqual({
        reason: 'ten_minute_call_limit',
        until: tenMinutes,
        windowMs: tenMinutes,
    })
    expect(budget.limit(tenMinutes - 1, false)?.until).toBe(tenMinutes)
    expect(budget.limit(tenMinutes, false)).toBeUndefined()
    budget.spend(tenMinutes, false)
    expect(budget.limit(tenMinutes, false)?.until).toBe(tenMinutes + 1)
})

it('reports the last window to reopen and finds the longer limit on its own', () => {
    const limits = { maxCallsPerMinute: 2, maxCallsPer10Minutes: 3 }
    const budget = new NpcAiCallBudget(limits)
    budget.spend(0, false)
    spendCalls(budget, 2, tenMinutes - minute + 1)
    const now = tenMinutes - minute + 2
    expect(budget.limit(now, false)).toEqual({
        reason: 'minute_call_limit',
        until: tenMinutes + 1,
        windowMs: minute,
    })
    expect(budget.longLimit(now, false)).toEqual({
        reason: 'ten_minute_call_limit',
        until: tenMinutes,
        windowMs: tenMinutes,
    })

    const tied = new NpcAiCallBudget(limits)
    tied.spend(0, false)
    spendCalls(tied, 2, tenMinutes - minute)
    expect(tied.limit(now, false)?.reason).toBe('ten_minute_call_limit')
})

it('reserves room for foreground calls in either window', () => {
    const budget = new NpcAiCallBudget(defaultNpcAiLimits)
    for (let index = 0; index < 5; index += 1) {
        spendCalls(budget, 13, index * minute, true)
    }
    expect(budget.limit(4 * minute + 13, true)).toEqual({
        reason: 'background_call_limit',
        until: 5 * minute,
        windowMs: minute,
    })
    expect(budget.limit(4 * minute + 13, false)).toBeUndefined()

    budget.spend(5 * minute, true)
    expect(budget.limit(5 * minute, true)).toEqual({
        reason: 'background_call_limit',
        until: tenMinutes,
        windowMs: tenMinutes,
    })
    expect(budget.limit(5 * minute, false)).toBeUndefined()
})

it('honors an explicit hourly limit and a zero-capacity background reserve', () => {
    const budget = new NpcAiCallBudget({
        ...defaultNpcAiLimits,
        maxCallsPerHour: 1,
    })
    expect(budget.limit(0, true)).toEqual({
        reason: 'background_call_limit',
        until: Infinity,
        windowMs: hour,
    })
    budget.spend(0, false)
    expect(budget.limit(hour - 1, false)).toEqual({
        reason: 'hourly_call_limit',
        until: hour,
        windowMs: hour,
    })
    expect(budget.limit(hour, false)).toBeUndefined()
})

it('starts scarcity at 30 percent and clears it at 40 percent total headroom', () => {
    const budget = new NpcAiCallBudget(defaultNpcAiLimits)
    for (let index = 0; index < 3; index += 1) {
        spendCalls(budget, 13, index * minute, true)
        spendCalls(budget, 7, index * minute + 13)
    }
    spendCalls(budget, 9, 3 * minute)
    expect(budget.isScarce(3 * minute + 8)).toBe(false)
    budget.spend(3 * minute + 9, false)
    expect(budget.isScarce(3 * minute + 9)).toBe(true)
    expect(budget.isScarce(tenMinutes + 8)).toBe(true)
    expect(budget.isScarce(tenMinutes + 9)).toBe(false)
})
