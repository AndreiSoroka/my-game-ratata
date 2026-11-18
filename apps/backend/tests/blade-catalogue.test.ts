import { MASTERY_NAMES } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { resolveBladeBonuses } from '../src/game/constellationBladeBonuses'
import { constellationPaths } from '../src/game/constellationCatalog'
import { fullConstellationCatalog } from '../src/game/constellationNodes'
import { canDiscoverConstellationStar } from '../src/game/constellationRequirements'
import { observedConstellationCardEffects } from '../src/game/constellationResultDisclosure'
import { syncAbilityConstellations } from '../src/game/constellations'
import { snapshotConstellations } from '../src/game/constellationSnapshot'
import { prepareConstellationLayout } from '../src/game/personalConstellationSky'
import { abilityHero } from './abilityTestHelpers'

const byId = new Map(fullConstellationCatalog.map((node) => [node.id, node]))
const all = new Set(fullConstellationCatalog.map((node) => node.id))

it('has exactly 42 Blade and 42 Mother stars and preserves every old Blade identity', () => {
    for (const path of ['blade', 'prayer']) {
        const stars = fullConstellationCatalog.filter(
            (node) => node.constellationId === path
        )
        expect(stars).toHaveLength(42)
        expect(new Set(stars.map((node) => node.id)).size).toBe(42)
        for (const node of stars) {
            expect(node.description).not.toMatch(/\d/u)
        }
    }
    for (const suffix of [
        'root',
        'damage1',
        'damage2',
        'economy',
        'tempo',
        'critical',
        'dodge',
        'resolve',
        'insight1',
        'insight2',
    ]) {
        expect(byId.has(`blade.${suffix}`)).toBe(true)
    }
    expect(byId.get('blade.dodge')?.name).toBe('Парирование')
    expect(byId.get('blade.insight2')?.name).toBe('Чувство боя')
    expect(MASTERY_NAMES.prayer).toBe('Угольная Мать')
    expect(constellationPaths.find((path) => path.id === 'prayer')?.name).toBe(
        'Угольная Мать'
    )
    expect(byId.get('prayer.root')?.name).toBe('Молитва')
})

it('requires all parents and level twelve for the first combo star', () => {
    const actor = abilityHero('vanguard')
    const node = byId.get('blade.combo1')
    if (node === undefined) {
        throw new Error('Missing combo star')
    }
    const levels = Object.fromEntries(
        Object.keys(actor.progression.masteries).map((id) => [id, 99])
    ) as Record<keyof typeof actor.progression.masteries, number>
    const context = {
        opened: new Set(node.parents),
        levels,
        knownAbilities: actor.abilities.known,
    }
    expect(canDiscoverConstellationStar(node, context)).toBe(true)
    expect(
        canDiscoverConstellationStar(node, {
            ...context,
            levels: { ...levels, blade: 11 },
        })
    ).toBe(false)
    for (const parent of node.parents) {
        expect(
            canDiscoverConstellationStar(node, {
                ...context,
                opened: new Set(node.parents.filter((id) => id !== parent)),
            })
        ).toBe(false)
    }
    expect(byId.get('blade.arrow_deflect')?.parents).toEqual([
        'blade.guard_strong',
        'blade.dodge2',
    ])
    expect(byId.get('blade.steel_sinew')?.parents).toEqual([
        'blade.resolve2',
        'life.hp2',
    ])
    expect(byId.get('blade.long_frontier')?.parents).toEqual([
        'blade.guard_strong',
        'life.energy2',
    ])
})

it('adds percentages from one basis and selects whole stun, parry and combo tiers', () => {
    const bonuses = resolveBladeBonuses(all)
    expect(bonuses).toMatchObject({
        swordDamageMultiplier: 1.35,
        swordTempoMultiplier: 0.7,
        swordEnergyMultiplier: 0.7,
        swordCritBonus: 0.1,
        swordDodgeBonus: 0.15,
        stunDurationMultiplier: 0.65,
        bladeStunChance: 0.2,
        bladeParryChance: 0.15,
        bladeComboLimit: 10,
    })
    for (const [id, chance] of [
        ['stun1', 0.05],
        ['stun2', 0.1],
        ['stun3', 0.2],
    ] as const) {
        expect(
            resolveBladeBonuses(new Set([`blade.${id}`])).bladeStunChance
        ).toBe(chance)
    }
    expect(resolveBladeBonuses(new Set()).bladeStunChance).toBe(0.01)
})

it.each(['blade', 'prayer'] as const)(
    'reveals zero, one, two or all own %s result rows without revealing other paths',
    (path) => {
        const id = `${path}.root`
        const learned = new Set([
            id,
            ...(path === 'prayer' ? ['prayer.revive'] : []),
        ])
        expect(observedConstellationCardEffects(id, learned)).toBeUndefined()
        learned.add(`${path}.insight1`)
        expect(observedConstellationCardEffects(id, learned)).toHaveLength(1)
        learned.add(`${path}.insight2`)
        expect(observedConstellationCardEffects(id, learned)).toHaveLength(2)
        learned.add(`${path}.insight3`)
        expect(
            observedConstellationCardEffects(id, learned)?.length
        ).toBeGreaterThan(2)
        const other = path === 'blade' ? 'prayer' : 'blade'
        learned.add(`${other}.root`)
        expect(
            observedConstellationCardEffects(`${other}.root`, learned)
        ).toBeUndefined()
    }
)

it('projects only earned result rows and independently grants the five learned active actions', () => {
    const actor = abilityHero('vanguard')
    prepareConstellationLayout(actor)
    const states = actor.progression.constellations.opened
    const before = JSON.stringify(snapshotConstellations(actor))
    expect(before).not.toContain('Урон клинка увеличен на 10%')
    for (const id of [
        'wide_swing',
        'circular_swing',
        'lunge',
        'pommel_strike',
        'defensive_stance',
    ] as const) {
        states.add(`blade.${id}`)
    }
    syncAbilityConstellations(actor)
    for (const id of [
        'wide_swing',
        'circular_swing',
        'lunge',
        'pommel_strike',
        'defensive_stance',
    ] as const) {
        expect(actor.abilities.known.has(id)).toBe(true)
    }
    expect(actor.abilities.known.has('pray')).toBe(false)
    states.add('blade.insight1')
    const known = snapshotConstellations(actor).nodes.filter(
        (node) => node.constellationId === 'blade' && node.unlocked
    )
    for (const node of known) {
        expect(node.effects).toHaveLength(1)
    }
    expect(states.has('life.hp4')).toBe(false)
    expect(states.has('life.energy3')).toBe(false)
    expect(states.has('prayer.omen3')).toBe(false)
})
