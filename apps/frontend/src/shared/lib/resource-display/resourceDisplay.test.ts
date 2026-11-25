import { expect, it } from 'vitest'

import { healthBarPercent, healthText } from './index'

it('keeps public progress separate from exact resource numbers', () => {
    expect(healthBarPercent({ kind: 'percent', percent: 37 })).toBe(37)
    expect(healthBarPercent({ kind: 'percent', percent: 0 })).toBe(0)
    expect(healthText({ kind: 'percent', percent: 37 })).toBe('')
})

it('rounds visible exact numbers and bounds the resource fill', () => {
    const actual = { kind: 'exact', current: 17.8704, max: 30 } as const
    const empty = { kind: 'exact', current: 0, max: 0 } as const
    const overfilled = { kind: 'exact', current: 12, max: 10 } as const

    expect(healthBarPercent(actual)).toBeCloseTo((17.8704 / 30) * 100)
    expect(healthText(actual)).toBe('18/30')
    expect(healthBarPercent(empty)).toBe(0)
    expect(healthText(empty)).toBe('0/0')
    expect(healthBarPercent(overfilled)).toBe(100)
    expect(healthText(overfilled)).toBe('12/10')
})
