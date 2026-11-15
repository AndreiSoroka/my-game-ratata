import { type AbilityId, createMasteryLevels } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { fullConstellationCatalog } from '../src/game/constellationNodes'
import {
    canDiscoverConstellationStar,
    type ConstellationRequirementContext,
} from '../src/game/constellationRequirements'

const node = (id: string) => {
    const result = fullConstellationCatalog.find((entry) => entry.id === id)
    if (result === undefined) {
        throw new Error(`Missing star: ${id}`)
    }
    return result
}
function context(
    level = 1,
    parents: string[] = []
): ConstellationRequirementContext {
    const levels = createMasteryLevels()
    levels.prayer = level
    return {
        opened: new Set(['prayer.root', 'prayer.revive', ...parents]),
        levels,
        knownAbilities: new Set<AbilityId>(['pray']),
        heroClass: 'cleric',
    }
}

describe('individually authored constellation requirements', () => {
    it('removes depth-based gates from every ordinary random star', () => {
        const individual = new Map([
            ['magic.fire_damage', 3],
            ['prayer.revive_master', 12],
            ['prayer.revive_angelic', 12],
        ])
        for (const star of fullConstellationCatalog.filter(
            (entry) => entry.acquisition === 'random'
        )) {
            expect(star.minimumLevel, star.id).toBe(
                individual.get(star.id) ?? 1
            )
        }
        expect(node('magic.fireball').minimumLevel).toBe(3)
        expect(node('magic.greater_fireball').minimumLevel).toBe(10)
        expect(node('prayer.revive').minimumLevel).toBe(5)
    })
    it('keeps all five upgrades random, passive and bound to the learned Mother prayer', () => {
        const upgrades = fullConstellationCatalog.filter((entry) =>
            entry.id.startsWith('prayer.revive_')
        )
        expect(upgrades).toHaveLength(5)
        for (const star of upgrades) {
            expect(star.acquisition).toBe('random')
            expect(star.effectType).toBe('passive')
            expect(star.ability).toBe('pray')
            expect(star.activationAbilityId).toBeUndefined()
            expect(star.evidence).toEqual([])
            expect(star.id.endsWith('.revive')).toBe(false)
        }
    })
    it('requires every parent together without adding a generation-level condition', () => {
        const experienced = 'prayer.revive_experienced'
        const higher = 'prayer.revive_higher'
        for (const id of ['prayer.revive_higher', experienced]) {
            expect(canDiscoverConstellationStar(node(id), context())).toBe(true)
        }
        const stable = node('prayer.revive_stable')
        expect(
            canDiscoverConstellationStar(stable, context(1, [experienced]))
        ).toBe(false)
        expect(canDiscoverConstellationStar(stable, context(1, [higher]))).toBe(
            false
        )
        expect(
            canDiscoverConstellationStar(
                stable,
                context(1, [experienced, higher])
            )
        ).toBe(true)
        const unknownPrayer = context(1, [experienced, higher])
        unknownPrayer.knownAbilities = new Set()
        expect(canDiscoverConstellationStar(stable, unknownPrayer)).toBe(false)
    })
    it('holds Master and Angelic outside the random pool until Miracles12 and all parents are present', () => {
        const experienced = 'prayer.revive_experienced'
        const higher = 'prayer.revive_higher'
        const master = node('prayer.revive_master')
        expect(
            canDiscoverConstellationStar(master, context(11, [experienced]))
        ).toBe(false)
        expect(
            canDiscoverConstellationStar(master, context(12, [experienced]))
        ).toBe(true)
        expect(
            canDiscoverConstellationStar(master, context(12, [higher]))
        ).toBe(false)
        const angelic = node('prayer.revive_angelic')
        expect(
            canDiscoverConstellationStar(
                angelic,
                context(11, [experienced, higher])
            )
        ).toBe(false)
        expect(
            canDiscoverConstellationStar(angelic, context(12, [experienced]))
        ).toBe(false)
        expect(
            canDiscoverConstellationStar(angelic, context(12, [higher]))
        ).toBe(false)
        expect(
            canDiscoverConstellationStar(
                angelic,
                context(12, [experienced, higher])
            )
        ).toBe(true)
    })
})
