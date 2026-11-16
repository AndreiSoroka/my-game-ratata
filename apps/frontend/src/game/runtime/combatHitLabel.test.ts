import { expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import { combatEffectCues, eventCaption } from './combatEffectPlan'
import { combatHitLabel, hitColors } from './combatHitLabel'
import { DamageTimeline } from './damagePresentation'

it.each([
    ['weak', 'Слабый удар', '#a7a7a7'],
    ['normal', 'Удар', '#ffe8a4'],
    ['strong', 'Добротный удар', '#ffad4a'],
    ['critical', 'Критический удар', '#ff5858'],
] as const)('presents %s without needing a damage amount', (quality, label, color) => {
    const event = { kind: 'damage', targetId: 'target', hitQuality: quality } as const
    expect(combatHitLabel(event)).toBe(label)
    expect(hitColors[quality]).toBe(color)
    expect(new DamageTimeline().receive(event, 0, true)).toMatchObject({ quality })
    expect(eventCaption(event)).toBeUndefined()
    expect(combatHitLabel({ ...event, amount: 7 })).toBe('−7')
})

it('keeps hidden healing, absorption and prayer impact effects without leaking numbers', () => {
    const actor = characterFixture('priest')
    expect(eventCaption({ kind: 'absorb' })).toBe('Барьер')
    expect(eventCaption({ kind: 'heal' })).toBe('Восстановление')
    expect(eventCaption({ kind: 'miss', hitQuality: 'miss' })).toBe('Промах')
    expect(hitColors.miss).toBe('#a7a7a7')
    expect(combatEffectCues({ kind: 'absorb' }, actor)[0]?.kind).toBe('barrier')
    expect(combatEffectCues({ kind: 'heal' }, actor)[0]?.kind).toBe('restore')
    expect(
        combatEffectCues({ kind: 'damage', abilityId: 'pray' }, actor).map((c) => c.kind)
    ).toEqual(['wave', 'prayer_hit'])
})
