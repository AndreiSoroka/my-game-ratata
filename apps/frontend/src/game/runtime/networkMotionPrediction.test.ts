import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { NetworkMotion } from './networkMotion'
import { OwnerMotionLead } from './ownerMotionLead'

it.each([
    [20, 80],
    [80, 20],
])('matches the ordinary stop at a known painted frame with %i/%i ms delay', (up, down) => {
    const motion = new NetworkMotion()
    motion.setMap({
        width: 100,
        height: 100,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(10_000).fill(false),
    })
    const axis = { x: 1, y: 0 }
    const start = 1000
    const speed = 0.09
    motion.setTiming({
        tickMs: 50,
        manualAxis: () => axis,
        estimateReceiptTime: (localTime) => localTime + start + up,
    })
    const initial = characterFixture('hero', {
        animation: { action: 'walk', startedAt: start },
        movement: { mode: 'walking', dashing: false, dashCooldownMsLeft: 0 },
        velocity: { x: speed * 50, y: 0 },
    })
    const positionAt = (serverTime: number) => ({ x: 80 + (serverTime - start) * speed, y: 80 })

    function observe(
        seq: number,
        serverTime: number,
        localTime: number,
        overrides?: Partial<CharacterSnapshot>
    ) {
        const character = { ...initial, position: positionAt(serverTime), ...overrides }
        motion.observe(
            {
                ...worldFixture([character], serverTime),
                tick: seq + 1,
                stepMs: 50,
                ...(overrides && { stopCorrection: { id: 1, status: 'accepted' as const } }),
            },
            localTime,
            'hero',
            { streamId: 1, seq }
        )
    }

    for (let seq = 0; seq <= 20; seq++) {
        observe(seq, start + seq * 50, seq * 50 + down)
        motion.frame(seq * 50 + down)
    }
    const release = 1000 + down + 15
    motion.frame(release)
    motion.recordDrawnOwner(motion.position('hero'))
    const request = motion.beginStop('hero', 1, release)
    const serverStop = start + release + up
    const authoritative = positionAt(serverStop)
    expect(request?.position.x).toBeCloseTo(authoritative.x, 2)
    motion.frame(release + 20)
    expect(motion.position('hero')).toEqual(request?.position)

    const ack = release + up + down + 20
    observe(21, serverStop + 20, ack, {
        position: authoritative,
        velocity: { x: 0, y: 0 },
    })
    motion.frame(ack + 100)
    expect(motion.position('hero')).toEqual(authoritative)
})

it('ramps in, caps and expires owner lead without rewinding presentation time', () => {
    const lead = new OwnerMotionLead()
    expect(lead.update(1000, 0, true, 2000)).toBe(1000)
    expect(lead.update(1040, 40, true, 2040)).toBe(1050)
    expect(lead.update(1500, 500, true, 2500)).toBe(1600)
    expect(lead.update(1500, 540, true, undefined)).toBe(1600)
    expect(lead.update(1700, 700, true, undefined)).toBe(1750)
    expect(lead.update(1900, 900, true, undefined)).toBe(1900)
    expect(lead.update(2000, 1000, false, 2500)).toBe(2000)
})
