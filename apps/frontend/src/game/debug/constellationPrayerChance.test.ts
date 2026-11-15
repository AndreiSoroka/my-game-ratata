import { expect, it } from 'vitest'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import { describePrayerEffectChance } from './constellationPrayerChance'

const description = (id: string) =>
    describePrayerEffectChance(fullConstellationCatalog.find((node) => node.id === id)!)!
it('describes all prayer nodes with independent readable complete mathematical legends', () => {
    const before = JSON.stringify(fullConstellationCatalog)
    const prayers = fullConstellationCatalog.filter((node) =>
        node.constellationId.startsWith('prayer')
    )
    expect(prayers).toHaveLength(29)
    for (const node of prayers) {
        const result = description(node.id)
        expect(result.summary.length).toBeGreaterThan(0)
        expect(result.formulas).toEqual(result.formulaDetails!.map((entry) => entry.expression))
        for (const formula of result.formulaDetails!) {
            expect(formula.expression).not.toMatch(/[А-Яа-яЁё]/)
            for (const symbol of formula.expression.match(/[A-Za-z]+/g) ?? []) {
                if (['min', 'max', 'round', 'ceil', 'mod'].includes(symbol)) continue
                expect(
                    formula.variables.some(
                        (entry) => entry.symbol === symbol && entry.description.length > 0
                    )
                ).toBe(true)
            }
        }
        expect(result.notes.join(' ')).not.toMatch(/Чудесах 1|уровни Веры|miracles|faith\)/)
    }
    expect(JSON.stringify(fullConstellationCatalog)).toBe(before)
})
it.each([
    ['prayer', 'Угольная Мать'],
    ['prayer_road', 'Безымянный Путник'],
    ['prayer_lantern', 'Слепой Архивариус'],
    ['prayer_grave', 'Хранитель Праха'],
])('uses only the own deity mood for %s', (path, god) => {
    const result = description(`${path}.root`)
    expect(result.summary).toContain(god)
    expect(result.formulas[0]).toBe('B')
    expect(result.formulaDetails![0]!.variables).toEqual([
        expect.objectContaining({ symbol: 'B', description: expect.stringMatching(/80.*55.*25/) }),
    ])
    expect(result.examples).toHaveLength(3)
    expect(result.examples.map((entry) => entry.value).join(' ')).not.toContain('отказ')
    expect(result.examples[1]!.value).toContain('55%')
})
it('preserves distinct per-step purification and Kara thresholds with fixed base power', () => {
    const root = description('prayer.root')
    expect(root.formulas).toContain('min(95, 20 × P / 55)')
    expect(root.formulas).toContain('5')
    expect(root.examples.map((entry) => entry.value)).toEqual([
        'Успех 80%; очищение 29,09% за шаг.',
        'Успех 55%; очищение 20% за шаг.',
        'Успех 25%; очищение 9,09% за шаг.',
    ])
    const harm = description('prayer.harm')
    expect(harm.formulas).toContain('min(95, B + 20)')
    expect(harm.formulas).toContain('round(6 × Q)')
    expect(harm.formulas).not.toContain('round(6 × Q × M)')
    expect(harm.notes.join(' ')).toMatch(/один случайный бросок/i)
    expect(harm.examples.map((entry) => entry.value)).toEqual([
        'Кара 95%.',
        'Кара 75%.',
        'Кара 45%.',
    ])
    for (const id of ['prayer.harm', 'prayer.revive', 'prayer_grave.revive']) {
        const own = description(id)
        expect(own.formulaDetails?.map((entry) => entry.label).join(' ')).not.toMatch(/лечени/i)
        expect(own.examples.map((entry) => entry.value).join(' ')).not.toMatch(/лечени/i)
    }
})
it('keeps school-specific resurrection resources and ordinary modifiers deterministic', () => {
    expect(description('prayer.revive').formulas).toContain('max(1, ceil(N × 0,01))')
    expect(description('prayer.revive').formulas).toContain('max(1, 0,01 × N)')
    expect(description('prayer_grave.revive').formulas).toContain('max(1, ceil(N × 0,5))')
    expect(description('prayer_grave.revive').formulas).toContain('0,5 × N')
    for (const id of ['prayer.radius1', 'prayer.focus', 'prayer.gift1', 'prayer.last_light'])
        expect(description(id).formulas[0]).toBe('100')
    expect(description('prayer.last_light').formulas).toContain('H < 0,20 × N')
    expect(description('prayer.last_light').formulas).toContain(
        '1 + 0,05 × A + 0,05 × D + 0,10 × E'
    )
    expect(description('prayer.area').formulas).toContain('r < G / 100')
    const first = description('prayer.root')
    first.notes.length = 0
    expect(description('prayer.root').notes.length).toBeGreaterThan(0)
})
