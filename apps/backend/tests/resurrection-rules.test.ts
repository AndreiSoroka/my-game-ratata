import {
    calculateResurrectionResources,
    resolveResurrectionParameters,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

const full = new Set([
    'prayer.revive_higher',
    'prayer.revive_experienced',
    'prayer.revive_master',
    'prayer.revive_angelic',
    'prayer.revive_stable',
])
const maxima = { hp: 101, mana: 120, energy: 80 }

describe('shared resurrection parameters', () => {
    it('restores one percent of every resource with a minimum of one each', () => {
        const parameters = resolveResurrectionParameters(
            'pray',
            new Set(),
            'neutral'
        )
        expect(parameters).toEqual({
            successChance: 0.55,
            hpFraction: 0.01,
            resourceFraction: 0.01,
            angelicChance: 0,
            minimumResource: 1,
        })
        expect(calculateResurrectionResources(parameters, maxima)).toEqual({
            hp: 2,
            mana: 1.2,
            energy: 1,
        })
        expect(
            calculateResurrectionResources(parameters, {
                hp: 1,
                mana: 0,
                energy: 0,
            })
        ).toEqual({ hp: 1, mana: 1, energy: 1 })
    })
    it('replaces only health for Higher and Stable without scaling other resources', () => {
        const higher = resolveResurrectionParameters(
            'pray',
            new Set(['prayer.revive_higher']),
            'benevolent'
        )
        expect(calculateResurrectionResources(higher, maxima)).toEqual({
            hp: 76,
            mana: 1.2,
            energy: 1,
        })
        const stable = resolveResurrectionParameters('pray', full, 'wrathful')
        expect(calculateResurrectionResources(stable, maxima)).toEqual({
            hp: 101,
            mana: 1.2,
            energy: 1,
        })
        expect(calculateResurrectionResources(stable, maxima, true)).toEqual({
            hp: 152,
            mana: 180,
            energy: 120,
        })
    })
    it('adds percentage points and caps only the final resurrection chance at 95 percent', () => {
        const stars = new Set<string>()
        const chance = () =>
            resolveResurrectionParameters('pray', stars, 'neutral')
                .successChance
        expect(chance()).toBe(0.55)
        stars.add('prayer.revive_experienced')
        expect(chance()).toBeCloseTo(0.65)
        stars.add('prayer.revive_master')
        expect(chance()).toBeCloseTo(0.75)
        stars.add('prayer.revive_stable')
        expect(chance()).toBeCloseTo(0.8)
        expect(
            resolveResurrectionParameters('pray', full, 'benevolent')
                .successChance
        ).toBe(0.95)
        expect(
            resolveResurrectionParameters('pray', full, 'wrathful')
                .successChance
        ).toBe(0.5)
    })
    it('keeps Grave restoration at half resources even with all Mother enhancements', () => {
        const grave = resolveResurrectionParameters(
            'pray_grave',
            full,
            'neutral'
        )
        expect(grave).toEqual({
            successChance: 0.55,
            hpFraction: 0.5,
            resourceFraction: 0.5,
            angelicChance: 0,
            minimumResource: 0,
        })
        expect(calculateResurrectionResources(grave, maxima, true)).toEqual({
            hp: 51,
            mana: 60,
            energy: 40,
        })
        expect(
            calculateResurrectionResources(grave, { hp: 1, mana: 0, energy: 0 })
        ).toEqual({ hp: 1, mana: 0, energy: 0 })
    })
    it('keeps input metadata immutable and uses the same Angelic 30 percent in all moods', () => {
        const before = JSON.stringify(maxima)
        for (const mood of ['benevolent', 'neutral', 'wrathful'] as const) {
            const parameters = resolveResurrectionParameters('pray', full, mood)
            expect(parameters.angelicChance).toBe(0.3)
            expect(
                calculateResurrectionResources(parameters, maxima, true)
            ).toEqual({ hp: 152, mana: 180, energy: 120 })
        }
        expect(JSON.stringify(maxima)).toBe(before)
        expect(full.size).toBe(5)
    })
})
