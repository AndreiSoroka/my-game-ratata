import { describe, expect, it } from 'vitest'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import { buildConstellationDebugSnapshot } from './constellationDebugData'
import { describeConstellationEffectChance } from './constellationEffectChance'

describe('debug effect chance catalogue', () => {
    it('explains the effect probability of every authored star without changing game snapshots', () => {
        const catalogue = JSON.stringify(fullConstellationCatalog)
        const sky = buildConstellationDebugSnapshot({ heroClass: 'cleric', seed: 'effect-chances' })
        const snapshot = JSON.stringify(sky)
        expect(sky.nodes).toHaveLength(77)
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
})
