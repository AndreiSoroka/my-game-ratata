import type { MotionPingClientMessage } from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { MotionReceiptProbes } from './motionReceiptProbes'

const serverClockOffset = 10000
let probes: MotionReceiptProbes | undefined

afterEach(() => {
    probes?.stop()
    probes = undefined
    vi.useRealTimers()
    vi.restoreAllMocks()
})

function setup() {
    vi.useFakeTimers()
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const send = vi.fn<(message: MotionPingClientMessage) => void>()
    const receiptProbes = new MotionReceiptProbes(send)
    probes = receiptProbes
    receiptProbes.start()
    return {
        receiptProbes,
        send,
        setHidden: (value: boolean) => {
            hidden.mockReturnValue(value)
            document.dispatchEvent(new Event('visibilitychange'))
        },
        sample: (upstreamMs: number, downstreamMs: number) => {
            const id = send.mock.lastCall![0].id
            const serverReceivedAt = serverClockOffset + performance.now() + upstreamMs
            vi.advanceTimersByTime(upstreamMs + downstreamMs)
            receiptProbes.receive({ id, serverReceivedAt, type: 'motion_pong' }, performance.now())
            vi.advanceTimersByTime(1000 - upstreamMs - downstreamMs)
        },
        estimate: () => receiptProbes.estimateReceiptTime(performance.now()),
    }
}

it.each([
    [20, 80],
    [80, 20],
])('estimates receipt time with %i ms uplink and %i ms downlink', (upstreamMs, downstreamMs) => {
    const f = setup()
    for (let sample = 0; sample < 2; sample++) f.sample(upstreamMs, downstreamMs)
    expect(f.estimate()).toBeUndefined()
    f.sample(upstreamMs, downstreamMs)
    expect(f.estimate()).toBe(performance.now() + serverClockOffset + upstreamMs)
})

it('uses the median offset of the fastest three samples out of the five most recent', () => {
    const f = setup()
    f.sample(2, 2)
    f.sample(20, 50)
    f.sample(30, 50)
    f.sample(40, 40)
    f.sample(110, 60)
    expect(f.estimate()).toBe(performance.now() + serverClockOffset + 20)
    f.sample(50, 30)
    expect(f.estimate()).toBe(performance.now() + serverClockOffset + 30)
})

it('ignores late, mismatched and high RTT replies and expires old samples', () => {
    const f = setup()
    const staleId = f.send.mock.lastCall![0].id
    vi.advanceTimersByTime(1000)
    const activeId = f.send.mock.lastCall![0].id
    const serverReceivedAt = serverClockOffset + performance.now()
    f.receiptProbes.receive(
        { id: staleId, serverReceivedAt, type: 'motion_pong' },
        performance.now()
    )
    vi.advanceTimersByTime(301)
    f.receiptProbes.receive(
        { id: activeId, serverReceivedAt, type: 'motion_pong' },
        performance.now()
    )
    vi.advanceTimersByTime(699)
    f.sample(30, 40)
    f.sample(30, 40)
    expect(f.estimate()).toBeUndefined()
    f.sample(30, 40)
    expect(f.estimate()).toBe(performance.now() + serverClockOffset + 30)
    vi.advanceTimersByTime(5001)
    expect(f.estimate()).toBeUndefined()
})

it('clears pending probes and estimates when hidden, then resamples when visible', () => {
    const f = setup()
    for (let sample = 0; sample < 3; sample++) f.sample(30, 40)
    expect(f.estimate()).toBeDefined()
    const lastId = f.send.mock.lastCall![0].id
    f.setHidden(true)
    expect(f.estimate()).toBeUndefined()
    vi.advanceTimersByTime(2000)
    expect(f.send.mock.lastCall![0].id).toBe(lastId)
    f.setHidden(false)
    expect(f.send.mock.lastCall![0].id).toBe(lastId + 1)
    expect(f.estimate()).toBeUndefined()
})
