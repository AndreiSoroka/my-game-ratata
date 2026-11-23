import { afterEach, describe, expect, it, vi } from 'vitest'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import { chancePercent, criticalChance } from './constellationChanceMath'
import { describeOtherEffectChance } from './constellationOtherChance'

afterEach(() => vi.restoreAllMocks())

function description(id: string) {
    const node = fullConstellationCatalog.find((entry) => entry.id === id)
    if (node === undefined) throw new Error(`Unknown test star: ${id}`)
    return describeOtherEffectChance(node)
}

describe('all non-prayer effect explanations', () => {
    it('covers all authored non-prayer nodes with formulas without mutating metadata or drawing randomness', () => {
        const nodes = fullConstellationCatalog.filter(
            (node) => !node.constellationId.startsWith('prayer')
        )
        const before = JSON.stringify(fullConstellationCatalog)
        expect(nodes.filter((node) => node.constellationId === 'arrow')).toHaveLength(40)
        vi.spyOn(Math, 'random').mockImplementation(() => {
            throw new Error('An explanation must not roll gameplay randomness')
        })
        for (const node of nodes) {
            const effect = describeOtherEffectChance(node)
            expect(effect.summary.length).toBeGreaterThan(0)
            expect(effect.formulas.length).toBeGreaterThan(0)
            expect(effect.formulas.every((line) => line.length > 0)).toBe(true)
            expect(JSON.stringify(effect)).not.toMatch(/undefined|NaN/)
            expect(Object.keys(effect).sort()).toEqual([
                ...(effect.deterministic ? ['deterministic'] : []),
                'examples',
                'formulaDetails',
                'formulas',
                'notes',
                'summary',
            ])
            expect(effect.formulaDetails?.map((formula) => formula.expression)).toEqual(
                effect.formulas
            )
            for (const formula of effect.formulaDetails ?? []) {
                expect(formula.label.length).toBeGreaterThan(0)
                expect(formula.expression).not.toMatch(/[А-Яа-яЁё]/)
                const symbols = formula.expression.match(/[A-Za-z]+[₀-₉]*/g) ?? []
                const functions = ['min', 'max', 'floor', 'round', 'clamp']
                const legend = formula.variables.map((variable) => variable.symbol)
                for (const symbol of symbols.filter((entry) => !functions.includes(entry))) {
                    expect(legend).toContain(symbol)
                }
                for (const variable of formula.variables) {
                    expect(variable.description.length).toBeGreaterThan(0)
                    expect(symbols).toContain(variable.symbol)
                }
            }
        }
        expect(JSON.stringify(fullConstellationCatalog)).toBe(before)
    })

    it('does not invent a probability for an unrecognized star or share writable output arrays', () => {
        const node = fullConstellationCatalog[0]
        if (node === undefined) throw new Error('Missing catalog')
        expect(() => describeOtherEffectChance({ ...node, id: 'unknown.root' })).toThrow(
            'Не описана'
        )
        const first = description('blade.damage1')
        first.notes.push('mutated-output')
        first.formulas[0] = 'mutated-output'
        const formula = first.formulaDetails?.[0]
        if (formula === undefined) throw new Error('Missing formula details')
        formula.label = 'mutated-output'
        const variable = formula.variables[0]
        if (variable === undefined) throw new Error('Missing formula legend')
        variable.description = 'mutated-output'
        expect(JSON.stringify(description('blade.damage1'))).not.toContain('mutated-output')
    })

    it('labels deterministic bonuses and knowledge without promising guaranteed combat success', () => {
        expect(description('blade.damage1').summary).toContain('100%')
        expect(description('blade.damage1').notes.join(' ')).toContain('уклонение')
        expect(description('arrow.damage2').notes.join(' ')).toContain('+20%')
        expect(description('arrow.economy').formulas).toEqual(['10 − 2 = 8'])
        expect(description('life.hp4').summary).toContain('100%')
        expect(description('life.hp4').notes.join(' ')).toContain('не повышает')
        expect(description('shadow.sight').summary).toContain('геометрическим')
        expect(description('shadow.noise2').notes.join(' ')).toContain('35%')
        expect(description('undead.hollow_bones2')).toMatchObject({
            deterministic: true,
            notes: [expect.stringContaining('35% суммарно')],
        })
    })
})

describe('chance formula boundaries and examples', () => {
    it('caps critical bonuses and makes the shared blade condition explicit', () => {
        expect(criticalChance(0.05, 0.03)).toBeCloseTo(0.08)
        expect(criticalChance(0.94, 0.03)).toBe(0.95)
        expect(description('blade.critical').formulas).toEqual([
            'min(95, C + B)',
            '(1 − min(95, D + P) / 100) × C',
        ])
        expect(description('blade.critical').formulaDetails?.[0]?.variables).toEqual([
            expect.objectContaining({
                symbol: 'C',
                description: expect.stringContaining('процентах'),
            }),
            expect.objectContaining({
                symbol: 'B',
                description: expect.stringContaining('5 или 10'),
            }),
        ])
        expect(description('blade.critical').notes.join(' ')).toContain('исправный нож или меч')
        expect(description('arrow.critical').notes.join(' ')).toContain('не получает')
        expect(description('magic.root').formulaDetails?.[1]).toMatchObject({
            label: 'Шанс критического попадания Искры, %',
            expression: '(1 − D / 100) × min(95, C)',
        })
    })

    it('keeps detection, conditional success and total theft probability separate', () => {
        const root = description('theft.root')
        expect(root.examples.map(({ value }) => value)).toEqual([
            'Успех 35%, поимка 12%, тихий промах 53%.',
            'Успех 16%, поимка 20%, тихий промах 64%.',
        ])
        expect(description('theft.luck1').examples[0]?.value).toContain('36,76%')
        expect(description('theft.luck2').examples[0]?.value).toContain('38,52%')
        expect(description('theft.composure3').examples[0]?.value).toContain('поимка 8%')
        expect(root.formulas).toContain('(1 − D / 100) × U')
        expect(root.formulas).toContain('(1 − D / 100) × (100 − U)')
        expect(chancePercent(0.0475)).toBe('4,75%')
    })

    it('describes direct fireballs without critical or dodge rolls', () => {
        for (const id of ['magic.fireball', 'magic.greater_fireball']) {
            const effect = description(id)
            expect(effect.summary).toContain('100%')
            expect(effect.summary).toContain('Отдельных бросков на уклонение и крит нет')
            expect(effect.formulaDetails?.[0]?.variables).toContainEqual({
                symbol: 'K',
                description: 'Множитель «Жара»: 1.10 при изученной звезде, иначе 1.',
            })
            expect(effect.formulas.join(' ')).not.toContain('C')
        }
    })

    it('distinguishes strict runic charge expiry from inclusive discovery and consumes misses too', () => {
        const effect = description('magic.runic_echo')
        expect(effect.formulas[0]).toBe('t < t₀ + 5000')
        expect(effect.formulaDetails?.[0]?.variables).toContainEqual({
            symbol: 't₀',
            description: 'Время последнего полезного попадания боевым заклинанием.',
        })
        expect(effect.examples[0]?.value).toContain('действует')
        expect(effect.examples[1]?.value).toContain('истекло')
        expect(effect.notes.join(' ')).toContain('при запуске оплаченного Быстрого выстрела')
        expect(effect.notes.join(' ')).toContain('≤5000 мс включительно')
        expect(effect.notes.join(' ')).toContain('другую допустимую цель')
    })

    it('moves units and knowledge precision out of expressions into captions and legends', () => {
        expect(description('life.hp1').formulas).toEqual([
            '[floor(V / S) × S; floor(V / S) × S + S)',
        ])
        expect(description('life.hp1').formulaDetails?.[0]?.variables).toContainEqual({
            symbol: 'S',
            description: 'Шаг его оценки, указанный ниже.',
        })
        expect(description('life.hp1').notes.join(' ')).toContain('шаг 25')
        expect(description('life.hp4').formulas).toEqual(['V'])
        expect(description('magic.spark_economy').formulaDetails?.[0]).toEqual({
            label: 'Цена Искры, MP',
            expression: '6 − 1 = 5',
            variables: [],
        })
        expect(description('shadow.noise2').formulaDetails?.[0]?.variables).toContainEqual({
            symbol: 'M',
            description: 'Множитель громкости поверхности.',
        })
        expect(description('life.root').notes.join(' ')).toContain(
            'не меняет численные характеристики'
        )
    })
})
