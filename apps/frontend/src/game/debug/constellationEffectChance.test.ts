import { describe, expect, it } from 'vitest'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import { buildConstellationDebugSnapshot } from './constellationDebugData'
import { describeConstellationEffectChance } from './constellationEffectChance'

describe('debug effect chance catalogue', () => {
    it('explains the effect probability of every authored star without changing game snapshots', () => {
        const catalogue = JSON.stringify(fullConstellationCatalog)
        const sky = buildConstellationDebugSnapshot({ heroClass: 'cleric', seed: 'effect-chances' })
        const snapshot = JSON.stringify(sky)
        expect(sky.nodes).toHaveLength(fullConstellationCatalog.length)
        for (const node of sky.nodes) {
            const chance = describeConstellationEffectChance(node.id)
            expect(chance.summary.trim().length).toBeGreaterThan(0)
            expect(chance.summary).not.toContain('не найдена')
            expect(chance.formulas.length).toBeGreaterThan(0)
            expect(node).not.toHaveProperty('effectChance')
        }
        expect(JSON.stringify(sky)).toBe(snapshot)
        expect(JSON.stringify(fullConstellationCatalog)).toBe(catalogue)
    })

    it('handles an unknown canonical id without inventing an effect', () => {
        expect(describeConstellationEffectChance('foreign.root')).toEqual({
            summary: 'Звезда не найдена в каталоге.',
            formulas: [],
            examples: [],
            notes: [],
        })
    })

    it('gives every formula its own readable caption and short mathematical expression', () => {
        for (const node of fullConstellationCatalog) {
            const chance = describeConstellationEffectChance(node.id)
            expect(chance.formulaDetails?.length).toBe(chance.formulas.length)
            for (const [index, formula] of (chance.formulaDetails ?? []).entries()) {
                expect(formula.label.trim().length).toBeGreaterThan(0)
                expect(formula.expression).toBe(chance.formulas[index])
                expect(formula.expression).not.toMatch(/[А-Яа-яЁё]/u)
                for (const variable of formula.variables) {
                    expect(variable.symbol.trim().length).toBeGreaterThan(0)
                    expect(variable.description.trim().length).toBeGreaterThan(0)
                }
            }
        }
    })
})
