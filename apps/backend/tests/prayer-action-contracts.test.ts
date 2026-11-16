import {
    abilityIds,
    isMotherPrayer,
    isPrayerAbility,
    isPrayerAction,
    PRAYER_SCHOOL_DEFINITIONS,
    prayerAbilityIds,
    prayerActionIds,
    prayerManaCost,
    prayerSchoolId,
    profileForPrayer,
    resolveResurrectionParameters,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { resolveConstellationBonuses } from '../src/game/constellationBonuses'
import { fullConstellationCatalog } from '../src/game/constellationNodes'
import { canDiscoverConstellationStar } from '../src/game/constellationRequirements'
import { syncAbilityConstellations } from '../src/game/constellations'
import { abilityHero } from './abilityTestHelpers'

const node = (id: string) => {
    const found = fullConstellationCatalog.find((entry) => entry.id === id)
    if (found === undefined) {
        throw new Error(`Missing star ${id}`)
    }
    return found
}

describe('Mother cast actions belong to one canonical school', () => {
    it('keeps exactly four learnable schools while exposing Woven as a distinct action', () => {
        expect(prayerAbilityIds).toHaveLength(4)
        expect(prayerActionIds).toHaveLength(5)
        expect(Object.keys(PRAYER_SCHOOL_DEFINITIONS)).toHaveLength(4)
        expect(abilityIds).toContain('pray_woven')
        expect(isPrayerAbility('pray_woven')).toBe(false)
        expect(isPrayerAction('pray_woven')).toBe(true)
        expect(prayerSchoolId('pray_woven')).toBe('pray')
        expect(isMotherPrayer('pray_woven')).toBe(true)
        expect(profileForPrayer('pray_woven')).toBe(profileForPrayer('pray'))
        expect(prayerManaCost('revive', 'pray_woven')).toBe(5)
        expect(prayerManaCost('revive', 'pray_grave')).toBe(20)
    })
    it('uses the same revival upgrades for both Mother actions without altering Ash', () => {
        const stars = new Set([
            'prayer.revive_higher',
            'prayer.revive_experienced',
        ])
        expect(
            resolveResurrectionParameters('pray_woven', stars, 'neutral')
        ).toEqual(resolveResurrectionParameters('pray', stars, 'neutral'))
        expect(
            resolveResurrectionParameters('pray_grave', stars, 'neutral')
                .hpFraction
        ).toBe(0.5)
    })
    it('grants Woven on discovering its active star without changing the starter action', () => {
        const actor = abilityHero('cleric')
        expect(actor.abilities.known.has('pray_woven')).toBe(false)
        actor.progression.constellations.opened.add('prayer.area')
        syncAbilityConstellations(actor)
        expect(actor.abilities.known.has('pray')).toBe(true)
        expect(actor.abilities.known.has('pray_woven')).toBe(true)
        expect(node('prayer.area')).toMatchObject({
            effectType: 'active',
            activationAbilityId: 'pray_woven',
        })
    })
})

describe('authored prayer requirements and independent effects', () => {
    it('requires every Woven parent and applies only the individually authored thresholds', () => {
        const actor = abilityHero('cleric')
        const opened = new Set(node('prayer.area').parents)
        const levels = Object.fromEntries(
            Object.keys(actor.progression.masteries).map((id) => [id, 99])
        ) as Record<keyof typeof actor.progression.masteries, number>
        const context = {
            opened,
            levels,
            knownAbilities: actor.abilities.known,
            heroClass: 'cleric' as const,
        }
        expect(canDiscoverConstellationStar(node('prayer.area'), context)).toBe(
            true
        )
        for (const parent of opened) {
            expect(
                canDiscoverConstellationStar(node('prayer.area'), {
                    ...context,
                    opened: new Set([...opened].filter((id) => id !== parent)),
                })
            ).toBe(false)
        }
        for (const [id, minimum] of [
            ['prayer.harm1', 6],
            ['prayer.harm2', 12],
            ['prayer.ward3', 7],
            ['prayer.ward4', 12],
            ['prayer.aura_domain', 12],
        ] as const) {
            const target = node(id)
            const parents = new Set(target.parents)
            expect(
                canDiscoverConstellationStar(target, {
                    ...context,
                    opened: parents,
                    levels: { ...levels, prayer: minimum - 1 },
                })
            ).toBe(false)
            expect(
                canDiscoverConstellationStar(target, {
                    ...context,
                    opened: parents,
                    levels: { ...levels, prayer: minimum },
                })
            ).toBe(true)
        }
        expect(node('prayer.martyr').acquisition).toBe('event')
    })
    it('combines ranks by capacity and applies additive Hasty Kara and speed modifiers', () => {
        expect(
            resolveConstellationBonuses(new Set(['prayer.targets1']))
                .targetLimit
        ).toBe(2)
        expect(
            resolveConstellationBonuses(
                new Set(['prayer.targets1', 'prayer.targets2'])
            ).targetLimit
        ).toBe(5)
        const all = resolveConstellationBonuses(
            new Set(fullConstellationCatalog.map((entry) => entry.id)),
            true
        )
        expect(all.targetLimit).toBe(20)
        expect(all.prayerHarmMultiplier).toBeCloseTo(4.6)
        expect(all.prayerGiftMultiplier).toBeCloseTo(14.95)
        expect(all.prayerDurationMultiplier).toBeCloseTo(0.2)
        expect(all.prayerConcentrationChance).toBe(1)
        expect(all.prayerWardRank).toBe(4)
        expect(all.prayerAuraDomain).toBe(true)
        expect(all.prayerLastLight).toBe(true)
        expect(all.prayerMartyr).toBe(true)
    })
})
