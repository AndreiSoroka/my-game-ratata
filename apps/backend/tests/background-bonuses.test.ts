import {
    backgroundMasteryRewardMicros,
    backgroundResources,
    constellationIds,
    createMasteryLevels,
    type HeroClass,
    heroClasses,
    HUMAN_BASE_RESOURCES,
    masteryConflict,
    masteryTotalExperience,
    parseMasteryExperience,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { restoreCharacter } from '../src/game/characterRecovery'
import { effectiveMaxMana } from '../src/game/effectiveResources'
import { createCharacterConfig } from '../src/game/heroClasses'
import {
    awardMasteries,
    canUseResurrection,
} from '../src/game/skillProgression'

const starts = [
    ['vanguard', 50, 120, 40],
    ['ranger', 40, 120, 40],
    ['arcanist', 30, 100, 70],
    ['cleric', 30, 100, 40],
] as const
function hero(heroClass: HeroClass): GameCharacter {
    return new GameCharacter({
        id: `background:${heroClass}`,
        nickname: heroClass,
        archetype: 'human',
        heroClass,
        controllerKind: 'network_player',
        spawnPosition: { x: 100, y: 100 },
    })
}

it.each(starts)(
    'applies the %s resources once before learned percentage modifiers',
    (id, hp, energy, mana) => {
        const actor = hero(id)
        expect([
            actor.maxHp,
            actor.config.resources.maxEnergy,
            effectiveMaxMana(actor),
        ]).toEqual([hp, energy, mana])
        expect(backgroundResources(id)).toEqual({ health: hp, energy, mana })
        actor.progression.constellations.opened.add('blade.steel_sinew')
        expect(actor.maxHp).toBe(Math.floor(hp * 1.1))
        actor.progression.constellations.opened.delete('blade.steel_sinew')
        actor.progression.constellations.opened.add('prayer.martyr')
        expect(actor.maxHp).toBe(Math.floor(hp * 0.7))
        expect(effectiveMaxMana(actor)).toBe(mana * 0.85)
        const config = structuredClone(actor.config)
        actor.applyDamage(actor.hp, 1000)
        restoreCharacter(actor, 2000, false)
        expect(actor.heroClass).toBe(id)
        expect(actor.config).toEqual(config)
        expect(actor.maxHp).toBe(Math.floor(hp * 0.7))
        actor.progression.constellations.opened.add('blade.steel_sinew')
        const remainingHp = actor.hp
        expect(actor.maxHp).toBe(Math.floor(hp * 0.8))
        expect(actor.hp).toBe(remainingHp)
        restoreCharacter(actor, 3000, false)
        expect(actor.maxHp).toBe(Math.floor(hp * 0.8))
        expect(actor.hp).toBe(Math.ceil(Math.floor(hp * 0.8) * 0.5))
        expect(actor.config).toEqual(config)
    }
)

it('keeps every combat and walking parameter independent of the starting background', () => {
    expect(backgroundResources()).toEqual(HUMAN_BASE_RESOURCES)
    const configs = heroClasses.map((id) => createCharacterConfig('human', id))
    const first = configs[0]
    if (first === undefined) {
        throw new Error('Missing background configuration')
    }
    for (const config of configs) {
        expect({ ...config.combat, maxHp: 0 }).toEqual({
            ...first.combat,
            maxHp: 0,
        })
        expect(config.attackZones).toEqual(first.attackZones)
        expect(config.moveSpeed).toBe(first.moveSpeed)
        expect(config.resources.attackEnergyCost).toBe(
            first.resources.attackEnergyCost
        )
        expect(config.resources.attackManaCost).toBe(
            first.resources.attackManaCost
        )
    }
    const cleric = hero('cleric')
    expect(cleric.abilities.known.has('pray')).toBe(true)
    expect(cleric.progression.constellations.opened.has('prayer.revive')).toBe(
        true
    )
    expect(canUseResurrection(cleric)).toBe(true)
    expect(hero('ranger').abilities.known.has('shot')).toBe(true)
    expect(hero('arcanist').abilities.known.has('spark')).toBe(true)
})

it.each([
    ['vanguard', 'blade'],
    ['ranger', 'arrow'],
    ['arcanist', 'magic'],
    ['cleric', 'prayer'],
    ['cleric', 'prayer_road'],
    ['cleric', 'prayer_lantern'],
    ['cleric', 'prayer_grave'],
] as const)(
    'awards %s a single rounded 20 percent bonus for %s while keeping conflict separate',
    (id, path) => {
        const actor = hero(id)
        const levels = { ...createMasteryLevels(), life: 7 }
        const factor = masteryConflict(levels, path)
        const factors = Object.fromEntries(
            constellationIds.map((key) => [key, key === path ? factor : 1])
        ) as Record<(typeof constellationIds)[number], number>
        const base = 3.000001
        const expected = BigInt(Math.round(base * 1.2 * factor * 1_000_000))
        const before = {
            xp: actor.xp,
            level: actor.level,
            inventory: [...actor.inventory],
        }
        awardMasteries(actor, [{ constellationId: path, experience: base }], {
            now: 1000,
            receiptId: 'one',
            factors,
        })
        expect(actor.progression.masteries[path].experience).toBe(expected)
        expect(factors[path]).toBe(factor)
        expect({
            xp: actor.xp,
            level: actor.level,
            inventory: actor.inventory,
        }).toEqual(before)
        expect(
            awardMasteries(
                actor,
                [{ constellationId: path, experience: base }],
                { now: 1100, receiptId: 'one', factors }
            )
        ).toEqual([])
        expect(actor.progression.masteries[path].experience).toBe(expected)
        expect(backgroundMasteryRewardMicros(base, factor, id, path)).toBe(
            expected
        )
    }
)

it('adds no bonus to unrelated branches and carries rewarded experience through levels once', () => {
    const actor = hero('vanguard')
    awardMasteries(
        actor,
        [
            { constellationId: 'blade', experience: 250 },
            { constellationId: 'life', experience: 30 },
        ],
        { now: 1000, receiptId: 'crossing', random: () => 0.9999 }
    )
    expect(actor.progression.masteries.blade).toEqual({
        level: 2,
        experience: parseMasteryExperience('100'),
    })
    expect(
        masteryTotalExperience(actor.progression.masteries.blade.level) +
            actor.progression.masteries.blade.experience
    ).toBe(parseMasteryExperience('300'))
    expect(actor.progression.masteries.life.experience).toBe(
        parseMasteryExperience('30')
    )
})

it('rounds once after the background and a fractional conflict rather than rounding each multiplier', () => {
    const actor = hero('arcanist')
    const factors = Object.fromEntries(
        constellationIds.map((id) => [id, 0.5])
    ) as Record<(typeof constellationIds)[number], number>
    const base = 1.0000005
    expect(backgroundMasteryRewardMicros(base, 0.5, 'arcanist', 'magic')).toBe(
        600000n
    )
    awardMasteries(actor, [{ constellationId: 'magic', experience: base }], {
        now: 1000,
        factors,
    })
    expect(actor.progression.masteries.magic.experience).toBe(600000n)
})
