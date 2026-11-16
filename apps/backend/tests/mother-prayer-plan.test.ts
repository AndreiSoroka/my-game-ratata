import { afterEach, describe, expect, it, vi } from 'vitest'

import { planMotherPrayer } from '../src/game/motherPrayerPlan'
import {
    affordableMotherPrayerTargets,
    motherPrayerCandidates,
    type MotherPrayerTarget,
} from '../src/game/motherPrayerTargets'
import { abilityContext, abilityHero } from './abilityTestHelpers'

afterEach(() => vi.restoreAllMocks())

function allocate(targets: readonly MotherPrayerTarget[], overrides = {}) {
    return affordableMotherPrayerTargets(targets, {
        mana: 100,
        maxMana: 100,
        lastLight: false,
        selfId: 'self',
        limit: 20,
        ...overrides,
    })
}

describe('pure Mother target budgeting', () => {
    it('deduplicates a character across effects, keeps grave IDs separate, and never edits candidates', () => {
        const targets: MotherPrayerTarget[] = [
            { kind: 'restore', id: 'shared' },
            { kind: 'harm', id: 'shared' },
            { kind: 'purify_grave', id: 'shared' },
            { kind: 'revive', id: 'other' },
        ]
        const before = structuredClone(targets)
        expect(allocate(targets, { mana: 10 })).toEqual({
            targets: [targets[0], targets[2]],
            manaCost: 10,
        })
        expect(targets).toEqual(before)
        expect(allocate(targets, { limit: 1 })?.targets).toEqual([targets[0]])
    })

    it('skips unaffordable optional healing but retains later affordable grave or damage effects', () => {
        const targets: MotherPrayerTarget[] = [
            { kind: 'restore', id: 'self' },
            { kind: 'restore', id: 'ally' },
            { kind: 'purify_grave', id: 'grave' },
        ]
        const budget = allocate(targets, {
            mana: 35,
            maxMana: 85,
            lastLight: true,
            limit: 2,
        })
        expect(budget?.targets).toEqual([targets[0], targets[2]])
        expect(budget?.manaCost).toBeCloseTo(30.5)
    })

    it('requires the full mandatory self-healing price while tolerating only numerical rounding noise', () => {
        const targets: MotherPrayerTarget[] = [
            { kind: 'restore', id: 'self' },
            { kind: 'harm', id: 'enemy' },
        ]
        expect(
            allocate(targets, { mana: 25.5, maxMana: 85, lastLight: true })
                ?.manaCost
        ).toBe(25.5)
        expect(
            allocate(targets, {
                mana: 25.5 - 1e-8,
                maxMana: 85,
                lastLight: true,
            })
        ).toBeUndefined()
        expect(
            allocate(targets, {
                mana: 25.5 - 1e-10,
                maxMana: 85,
                lastLight: true,
            })?.targets
        ).toEqual([targets[0]])
        expect(allocate(targets, { mana: 4 })?.targets).toEqual([])
    })
})

describe('read-only frozen Mother profiles', () => {
    it('uses deterministic category priority before distance and excludes self from the ally tier', () => {
        const actor = abilityHero()
        actor.hp -= 1
        actor.progression.constellations.opened.add('prayer.harm')
        const corpse = abilityHero()
        corpse.position.x += 20
        corpse.applyDamage(corpse.hp, 0)
        const ally = abilityHero()
        ally.hp -= 1
        const enemy = abilityHero('vanguard', 'undead')
        Object.assign(enemy, { faction: 'monsters' })
        const context = abilityContext([enemy, actor, ally, corpse], 1000)
        expect(motherPrayerCandidates(actor, context, 'pray')).toEqual([
            { kind: 'revive', id: corpse.id },
            { kind: 'restore', id: ally.id },
            { kind: 'restore', id: actor.id },
            { kind: 'harm', id: enemy.id },
        ])
    })

    it('freezes authored radius, duration, multipliers, mood and mastery factors without payment or RNG', () => {
        const actor = abilityHero()
        actor.hp -= 1
        actor.progression.constellations.opened.add('prayer.radius1')
        const context = abilityContext([actor], 29_000)
        context.navigation.grid.tileWidth = 24
        const before = structuredClone(actor.progression)
        const mana = actor.mana
        vi.spyOn(Math, 'random').mockImplementation(() => {
            throw new Error('Planning must not roll')
        })
        const plan = planMotherPrayer(
            actor,
            { mode: 'restore', targetId: actor.id },
            context,
            'pray'
        )
        expect(plan).toBeDefined()
        expect(plan?.radius).toBe(72)
        expect(plan?.durationMs).toBe(3000)
        expect(plan?.manaCost).toBe(5)
        expect(actor.mana).toBe(mana)
        expect(actor.progression).toEqual(before)
        const original = structuredClone(plan)
        actor.progression.constellations.opened.add('prayer.gift1')
        actor.progression.constellations.opened.add('prayer.focus')
        actor.progression.masteries.prayer.level += 1
        context.now = 31_000
        expect(plan).toEqual(original)
    })

    it('charges Last Light from the effective Martyr mana maximum and keeps self first', () => {
        const actor = abilityHero()
        actor.hp = 1
        actor.progression.constellations.hostileWound = 10
        actor.progression.constellations.lowHpFromHostile = true
        actor.progression.constellations.opened.add('prayer.martyr')
        actor.progression.constellations.opened.add('prayer.last_light')
        actor.mana = 30.6
        const context = abilityContext([actor], 1000)
        const plan = planMotherPrayer(
            actor,
            { mode: 'restore', targetId: actor.id },
            context,
            'pray'
        )
        expect(plan?.lastLight).toBe(true)
        expect(plan?.manaCost).toBeCloseTo(30.6)
        expect(plan?.targets).toEqual([{ kind: 'restore', id: actor.id }])
        expect(actor.mana).toBe(30.6)
        actor.mana -= 0.01
        expect(
            planMotherPrayer(
                actor,
                { mode: 'restore', targetId: actor.id },
                context,
                'pray'
            )
        ).toBeUndefined()
    })

    it('allows an aura-only budget only with an actual aura and does not fill devotion with candidates', () => {
        const actor = abilityHero()
        const context = abilityContext([actor])
        expect(
            planMotherPrayer(actor, { mode: 'devotion' }, context, 'pray')
        ).toBeUndefined()
        actor.progression.constellations.opened.add('prayer.aura_protection')
        actor.mana = 4
        expect(
            planMotherPrayer(actor, { mode: 'devotion' }, context, 'pray')
        ).toBeUndefined()
        actor.mana = 5
        const plan = planMotherPrayer(
            actor,
            { mode: 'devotion' },
            context,
            'pray'
        )
        expect(plan).toMatchObject({ targets: [], auraOnly: true, manaCost: 5 })
    })
})
