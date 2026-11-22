import {
    abilityIds,
    FARM_SOW_ENERGY,
    isPrayerAction,
    MOVEMENT_RULES,
    prayerManaCost,
    resourceNeedsRestoration,
    THEFT_RULES,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { effectiveAbility } from '../src/game/effectiveParameters'
import { handleDashWithFeedback } from '../src/game/movementFeedback'
import {
    observeResource,
    resourceChecks,
} from '../src/game/resourceObservation'
import { abilityHero } from './abilityTestHelpers'

describe('resource projection and affordability', () => {
    it.each([
        {
            current: 17.870400000000018,
            max: 30,
            percent: 59,
            hasCapacity: true,
        },
        { current: 0, max: 40, percent: 0, hasCapacity: true },
        { current: 40, max: 40, percent: 100, hasCapacity: true },
        { current: 0, max: 0, percent: 0, hasCapacity: false },
        { current: -1, max: 40, percent: 0, hasCapacity: true },
        { current: 45, max: 40, percent: 100, hasCapacity: true },
    ])(
        'projects $current/$max without numeric pool values',
        ({ current, max, percent, hasCapacity }) => {
            const exact = { kind: 'exact' as const, current, max }
            const projected = observeResource(exact, false)
            expect(projected).toEqual({ kind: 'percent', percent, hasCapacity })
            expect(resourceNeedsRestoration(projected)).toBe(
                hasCapacity && percent < 100
            )
            expect(observeResource(exact, true)).toEqual(exact)
        }
    )

    it('checks fractional balances at every existing cost boundary without spending', () => {
        const actor = abilityHero()
        for (const abilityId of abilityIds) {
            if (isPrayerAction(abilityId)) {
                continue
            }
            const { mana, energy } = effectiveAbility(actor, abilityId)
            const readyMana = mana + (abilityId === 'barrier' ? 0.001 : 0)
            actor.mana = readyMana
            actor.energy = energy
            expect(resourceChecks(actor).abilities[abilityId]).toBe('ready')
            if (mana > 0) {
                actor.mana = abilityId === 'barrier' ? mana : mana - 0.001
                expect(resourceChecks(actor).abilities[abilityId]).toBe('mana')
                actor.mana = readyMana
            }
            if (energy > 0) {
                actor.energy -= 0.001
                expect(resourceChecks(actor).abilities[abilityId]).toBe(
                    'energy'
                )
            }
        }
        for (const mode of [
            'devotion',
            'restore',
            'harm',
            'revive',
            'purify_grave',
        ] as const) {
            actor.mana = prayerManaCost(mode)
            expect(resourceChecks(actor).prayers.pray[mode]).toBe('ready')
            if (actor.mana > 0) {
                actor.mana -= 0.001
                expect(resourceChecks(actor).prayers.pray[mode]).toBe('mana')
            }
        }
        actor.mana = 0
        for (const [key, cost] of [
            ['dash', MOVEMENT_RULES.dashEnergy],
            ['sow', FARM_SOW_ENERGY],
            ['steal', THEFT_RULES.energyCost],
        ] as const) {
            actor.energy = cost
            expect(resourceChecks(actor)[key]).toBe('ready')
            actor.energy -= 0.001
            expect(resourceChecks(actor)[key]).toBe('energy')
            expect(actor.energy).toBe(cost - 0.001)
        }
    })

    it('distinguishes the five-mana Mother revival boundary from the twenty-mana Grave boundary', () => {
        const actor = abilityHero()
        actor.mana = 4.999
        expect(resourceChecks(actor).prayers.pray.revive).toBe('mana')
        actor.mana = 5
        expect(resourceChecks(actor).prayers.pray.revive).toBe('ready')
        expect(resourceChecks(actor).prayers.pray_grave.revive).toBe('mana')
        actor.mana = 19.999
        expect(resourceChecks(actor).prayers.pray_grave.revive).toBe('mana')
        actor.mana = 20
        expect(resourceChecks(actor).prayers.pray_grave.revive).toBe('ready')
    })

    it('keeps devotion affordable at zero mana and keeps ordinary weakened attacks legal', () => {
        const actor = abilityHero()
        actor.mana = 0
        actor.energy = 0
        expect(resourceChecks(actor).prayers.pray.devotion).toBe('ready')
        expect(actor.spendAttackResources().fullyPowered).toBe(false)
        expect(actor.energy).toBe(0)
        expect(actor.mana).toBe(0)
    })

    it('does not put the current energy balance in a private dash receipt', () => {
        const actor = abilityHero()
        actor.energy = 17.870400000000018
        const event = handleDashWithFeedback(actor, 1000)[0]
        expect(event?.text).toContain('Не хватает энергии')
        expect(event?.text).not.toMatch(/Сейчас|17\.87/)
    })
})

describe('owner segment boundaries', () => {
    it.each([
        [0, 100, 0, true],
        [0.001, 100, 40, true],
        [48, 120, 40, true],
        [48.001, 120, 60, true],
        [90, 100, 100, true],
        [100, 100, 100, false],
        [110, 100, 100, false],
        [0, 0, 0, false],
    ])(
        'projects %s/%s as %s%% without changing eligibility',
        (current, max, percent, missing) => {
            const segments = [40, 20, 20, 20]
            const exact = { kind: 'exact' as const, current, max }
            const projected = observeResource(exact, false, segments)
            expect(projected).toEqual({
                kind: 'percent',
                percent,
                hasCapacity: max > 0,
                segments,
                needsRestoration: missing,
            })
            expect(resourceNeedsRestoration(projected)).toBe(missing)
            expect(observeResource(exact, true, segments)).toEqual(exact)
        }
    )
})
