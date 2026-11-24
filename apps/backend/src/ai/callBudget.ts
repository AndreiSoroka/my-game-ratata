import type { NpcAiConfig } from './types'

const minuteMs = 60_000
const tenMinutesMs = 10 * minuteMs
const hourMs = 60 * minuteMs

type HardLimitReason =
    'minute_call_limit' | 'ten_minute_call_limit' | 'hourly_call_limit'

interface WindowLimit {
    reason: HardLimitReason | 'background_call_limit'
    until: number
    windowMs: number
}

interface CallWindow {
    calls: number[]
    background: number[]
    maxCalls: number
    maxBackground: number
    windowMs: number
    reason: HardLimitReason
}

type BudgetLimits = Pick<
    NpcAiConfig['limits'],
    'maxCallsPerMinute' | 'maxCallsPer10Minutes' | 'maxCallsPerHour'
>

/** Shared rolling budget for dialogue, follow-up lookups and compact advice. */
export class NpcAiCallBudget {
    private readonly windows: CallWindow[]
    private readonly tenMinutes: CallWindow
    private scarce = false

    public constructor(limits: BudgetLimits) {
        this.tenMinutes = callWindow(
            limits.maxCallsPer10Minutes,
            tenMinutesMs,
            'ten_minute_call_limit'
        )
        this.windows = [
            callWindow(limits.maxCallsPerMinute, minuteMs, 'minute_call_limit'),
            this.tenMinutes,
        ]
        if (limits.maxCallsPerHour !== undefined) {
            this.windows.push(
                callWindow(limits.maxCallsPerHour, hourMs, 'hourly_call_limit')
            )
        }
    }

    public spend(at: number, background: boolean): void {
        this.isScarce(at)
        for (const window of this.windows) {
            window.calls.push(at)
            if (background) {
                window.background.push(at)
            }
        }
        if (!this.scarce) {
            this.isScarce(at)
        }
    }

    public isScarce(at: number): boolean {
        const { calls, maxCalls } = this.tenMinutes
        trim(calls, at - tenMinutesMs)
        const available = (maxCalls - calls.length) * 100
        this.scarce = this.scarce
            ? available < maxCalls * 40
            : available <= maxCalls * 30
        return this.scarce
    }

    public limit(at: number, background: boolean): WindowLimit | undefined {
        return this.latestLimit(at, background, minuteMs)
    }

    public longLimit(at: number, background: boolean): WindowLimit | undefined {
        return this.latestLimit(at, background, tenMinutesMs)
    }

    private latestLimit(
        at: number,
        background: boolean,
        minWindowMs: number
    ): WindowLimit | undefined {
        let latest: WindowLimit | undefined
        for (const window of this.windows) {
            if (window.windowMs < minWindowMs) {
                continue
            }
            const limit = windowLimit(window, at, background)
            // Windows are examined from shortest to longest.
            if (
                limit !== undefined &&
                (latest === undefined || limit.until >= latest.until)
            ) {
                latest = limit
            }
        }
        return latest
    }
}

function callWindow(
    maxCalls: number,
    windowMs: number,
    reason: HardLimitReason
): CallWindow {
    return {
        calls: [],
        background: [],
        maxCalls,
        maxBackground: Math.floor((maxCalls * 2) / 3),
        windowMs,
        reason,
    }
}

function windowLimit(
    window: CallWindow,
    at: number,
    background: boolean
): WindowLimit | undefined {
    const { calls, maxCalls, maxBackground, windowMs, reason } = window
    trim(calls, at - windowMs)

    const totalUntil = unblocksAt(calls, maxCalls, windowMs)
    if (background) {
        trim(window.background, at - windowMs)
        const backgroundUntil = unblocksAt(
            window.background,
            maxBackground,
            windowMs
        )
        if (
            backgroundUntil !== undefined &&
            (totalUntil === undefined || backgroundUntil >= totalUntil)
        ) {
            return {
                reason: 'background_call_limit',
                until: backgroundUntil,
                windowMs,
            }
        }
    }
    if (totalUntil !== undefined) {
        return { reason, until: totalUntil, windowMs }
    }
    return undefined
}

function unblocksAt(
    calls: number[],
    capacity: number,
    windowMs: number
): number | undefined {
    if (capacity === 0) {
        return Infinity
    }
    const expiringCall = calls[calls.length - capacity]
    return expiringCall === undefined ? undefined : expiringCall + windowMs
}

function trim(calls: number[], cutoff: number): void {
    let expired = 0
    for (const call of calls) {
        if (call > cutoff) {
            break
        }
        expired += 1
    }
    if (expired > 0) {
        calls.splice(0, expired)
    }
}
