import { afterEach, describe, expect, it, vi } from 'vitest'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import {
    chancePercent,
    criticalChance,
    swordDodgeChance,
    theftEffectChances,
} from './constellationChanceMath'
import { describeOtherEffectChance } from './constellationOtherChance'

afterEach(() => vi.restoreAllMocks())

function description(id: string) {
    const node = fullConstellationCatalog.find((entry) => entry.id === id)
    if (node === undefined) throw new Error(`Unknown test star: ${id}`)
    return describeOtherEffectChance(node)
}

describe('all non-prayer effect explanations', () => {
    it('covers all fifty-three nodes with formulas without mutating metadata or drawing randomness', () => {
        const nodes = fullConstellationCatalog.filter(
            (node) => !node.constellationId.startsWith('prayer')
        )
        const before = JSON.stringify(fullConstellationCatalog)
        expect(nodes).toHaveLength(53)
        vi.spyOn(Math, 'random').mockImplementation(() => {
            throw new Error('An explanation must not roll gameplay randomness')
        })
        for (const node of nodes) {
            const effect = describeOtherEffectChance(node)
            expect(effect.summary.length).toBeGreaterThan(0)
            expect(effect.formulas.length).toBeGreaterThan(0)
            expect(effect.formulas.every((line) => line.length > 0)).toBe(true)
            expect(JSON.stringify(effect)).not.toMatch(/undefined|NaN/)
            expect(Object.keys(effect).sort()).toEqual(['examples', 'formulas', 'notes', 'summary'])
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
        expect(JSON.stringify(description('blade.damage1'))).not.toContain('mutated-output')
    })

    it('labels deterministic bonuses and knowledge without promising guaranteed combat success', () => {
        expect(description('blade.damage1').summary).toContain('100%')
        expect(description('blade.damage1').notes.join(' ')).toContain('уклонение')
        expect(description('arrow.damage2').notes.join(' ')).toContain('+20%')
        expect(description('life.hp4').summary).toContain('100%')
        expect(description('life.hp4').notes.join(' ')).toContain('не повышает')
        expect(description('shadow.sight').summary).toContain('геометрическим')
        expect(description('shadow.noise2').notes.join(' ')).toContain('30%')
    })
})

describe('chance formula boundaries and examples', () => {
    it('caps critical and dodge bonuses and makes the sword condition explicit', () => {
        expect(criticalChance(0.05, 0.03)).toBeCloseTo(0.08)
        expect(criticalChance(0.94, 0.03)).toBe(0.95)
        expect(swordDodgeChance(0.05, 0, true)).toBeCloseTo(0.08)
        expect(swordDodgeChance(0.05, 0, false)).toBe(0.05)
        expect(swordDodgeChance(0.94, 0.02, true)).toBe(0.95)
        expect(description('blade.critical').formulas.join(' ')).toContain('min(95%')
        expect(description('blade.critical').notes.join(' ')).toContain('исправным')
        expect(description('arrow.critical').notes.join(' ')).toContain('не получает')
        expect(description('magic.root').formulas.join(' ')).toContain(
            'P(критического попадания Искры)'
        )
    })

    it('keeps detection, conditional success and total theft probability separate', () => {
        const first = theftEffectChances(1, 1, false, 0.03)
        expect(first.detected).toBeCloseTo(0.6)
        expect(first.success).toBeCloseTo(0.435)
        expect(first.unnoticed).toBeCloseTo(0.174)
        expect(first.detected + first.unnoticed + first.failedUnnoticed).toBeCloseTo(1)
        expect(theftEffectChances(1, 1, false, 0.06).unnoticed).toBeCloseTo(0.186)
        expect(theftEffectChances(1, 1, true, 0).unnoticed).toBeCloseTo(0.061)
        expect(theftEffectChances(100, 100, false, 0.06)).toMatchObject({
            detected: 0.1,
            success: 0.9,
        })
        expect(theftEffectChances(-100, -100, true, 0)).toMatchObject({
            detected: 0.9,
            success: 0.05,
        })
        expect(description('shadow.luck1').examples[0]?.value).toContain('17,4%')
        expect(description('shadow.luck2').examples[0]?.value).toContain('18,6%')
        expect(chancePercent(0.0475)).toBe('4,75%')
    })

    it('describes direct fireballs without critical or dodge rolls', () => {
        for (const id of ['magic.fireball', 'magic.greater_fireball']) {
            const effect = description(id)
            expect(effect.summary).toContain('100%')
            expect(effect.summary).toContain('без бросков')
            expect(effect.formulas.join(' ')).toContain('Kжара')
            expect(effect.formulas.join(' ')).not.toContain('P(крит')
        }
    })

    it('distinguishes strict runic charge expiry from inclusive discovery and consumes misses too', () => {
        const effect = description('magic.runic_echo')
        expect(effect.formulas[0]).toContain('now <')
        expect(effect.examples[0]?.value).toContain('действует')
        expect(effect.examples[1]?.value).toContain('истекло')
        expect(effect.notes.join(' ')).toContain('при запуске оплаченного Выстрела')
        expect(effect.notes.join(' ')).toContain('≤5000 мс включительно')
        expect(effect.notes.join(' ')).toContain('другую допустимую цель')
    })
})
