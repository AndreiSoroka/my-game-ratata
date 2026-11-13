import {
    creatureTypes,
    previewPrayerFromSnapshots,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { advanceRevive } from '../src/game/characterLife'
import { miracleChance } from '../src/game/deities'
import { prayerHarmTargets, previewPrayer } from '../src/game/prayerContext'
import { abilityContext, abilityHero } from './abilityTestHelpers'

const prayer = (targetId: string) =>
    ({
        type: 'use_ability',
        abilityId: 'pray',
        intent: { mode: 'restore', targetId },
    }) as const

it.each(['network_player', 'scripted', 'mob1'] as const)(
    'heals through the same rules for %s and never practices empty requests',
    (controller) => {
        const caster = abilityHero('cleric', 'humanoid', controller)
        const target = abilityHero('vanguard')
        const context = abilityContext([caster, target])
        expect(
            handleAbilityCommand(caster, prayer(target.id), context).some(
                (event) => event.kind === 'heal'
            )
        ).toBe(false)
        expect(caster.mana).toBe(120)
        target.hp -= 15
        expect(
            handleAbilityCommand(caster, prayer(target.id), context)
        ).toContainEqual(
            expect.objectContaining({ kind: 'heal', targetId: target.id })
        )
        expect(caster.mana).toBe(115)
        expect(caster.progression.skills.faith.practice).toBe(1)
        expect(caster.progression.skills.miracles.practice).toBe(1)
        handleAbilityCommand(caster, prayer(target.id), {
            ...context,
            now: 3999,
        })
        expect(caster.mana).toBe(115)
        handleAbilityCommand(caster, prayer(target.id), {
            ...context,
            now: 4000,
        })
        expect(caster.mana).toBe(110)
    }
)
it('keeps a failed miracle probabilistic, paid, and only trains faith', () => {
    const caster = abilityHero()
    caster.hp -= 10
    const events = handleAbilityCommand(
        caster,
        prayer(caster.id),
        abilityContext([caster], 1000, () => 1)
    )
    expect(events.some((event) => event.kind === 'heal')).toBe(false)
    expect(caster.mana).toBe(115)
    expect(caster.progression.skills.faith.practice).toBe(1)
    expect(caster.progression.skills.miracles.practice).toBe(0)
})
it('does not replace a stale pinned gift by another target or expensive revival', () => {
    const caster = abilityHero()
    const target = abilityHero()
    const corpse = abilityHero()
    corpse.applyDamage(corpse.hp, 100)
    const context = abilityContext([caster, target, corpse])
    expect(previewPrayer(caster, context).manaCost).toBe(20)
    const client = previewPrayerFromSnapshots(
        caster.snapshot(1000),
        context.characters.map((c) => c.snapshot(1000))
    )
    expect(client.intent).toEqual(previewPrayer(caster, context).intent)
    expect(
        handleAbilityCommand(caster, prayer(target.id), context).some(
            (event) => event.kind === 'cast'
        )
    ).toBe(false)
    expect(caster.mana).toBe(120)
    expect(caster.abilities.casting).toBe(null)
})
it('uses level three wave on all undead including allies, with one roll and no practice per victim', () => {
    const caster = abilityHero()
    caster.hp -= 10
    const allies = [
        abilityHero('vanguard', 'undead'),
        abilityHero('vanguard', 'undead'),
    ]
    const context = abilityContext([caster, ...allies], 1000)
    caster.progression.skills.miracles.level = 2
    expect(prayerHarmTargets(caster, context)).toEqual([])
    caster.progression.skills.miracles.level = 3
    let rolls = 0
    context.random = () => {
        rolls += 1
        return miracleChance(caster, context.now) + 0.01
    }
    const before = allies.map((target) => target.hp)
    const events = handleAbilityCommand(caster, prayer(caster.id), context)
    expect(events.filter((event) => event.kind === 'damage')).toHaveLength(2)
    expect(events.some((event) => event.kind === 'heal')).toBe(false)
    expect(rolls).toBe(1)
    expect(
        allies.every((target, index) => target.hp < (before[index] ?? 0))
    ).toBe(true)
    expect(caster.progression.skills.faith.practice).toBe(1)
    expect(caster.progression.skills.miracles.practice).toBe(0)
})
it('supports grave polarity for all fourteen types, including self, excluding constructs', () => {
    const caster = abilityHero()
    caster.progression.patron = 'grave'
    caster.progression.skills.miracles.level = 3
    const actors = creatureTypes.map((type) => abilityHero('vanguard', type))
    const context = abilityContext([caster, ...actors])
    const targets = prayerHarmTargets(caster, context)
    expect(targets).toContain(caster)
    expect(
        targets.filter(
            (target) =>
                target.creatureType === 'undead' ||
                target.creatureType === 'construct'
        )
    ).toEqual([])
    expect(targets).toHaveLength(13)
    const undead = actors.find((target) => target.creatureType === 'undead')
    if (undead === undefined) {
        throw new Error('Missing undead fixture')
    }
    undead.hp -= 10
    const events = handleAbilityCommand(caster, prayer(undead.id), context)
    expect(
        events.some(
            (event) => event.kind === 'heal' && event.targetId === undead.id
        )
    ).toBe(true)
    expect(
        events.some(
            (event) => event.kind === 'damage' && event.targetId === caster.id
        )
    ).toBe(true)
})
it('prevents friendly damage and healing that damage from training miracles', () => {
    const actor = abilityHero()
    const target = abilityHero()
    resolveCharacterDamage({
        actor,
        target,
        amount: 10,
        now: 100,
        damageKind: 'holy',
        respawnDelayMs: 15000,
    })
    const events = handleAbilityCommand(actor, prayer(target.id), {
        ...abilityContext([actor, target]),
        now: 31_000,
    })
    expect(events.some((event) => event.kind === 'heal')).toBe(true)
    expect(actor.progression.skills.faith.practice).toBe(0)
    expect(actor.progression.skills.miracles.practice).toBe(0)
    expect(target.abilities.untrainableHpDamage).toBeGreaterThan(0)
})
it('channels resurrection, preserves identity, and cancels for changed deity or offline target', () => {
    const caster = abilityHero()
    const target = abilityHero()
    target.applyDamage(target.hp, 100)
    const context = abilityContext([caster, target])
    const message = {
        type: 'use_ability',
        abilityId: 'pray',
        intent: { mode: 'revive', targetId: target.id },
    } as const
    handleAbilityCommand(caster, message, context)
    expect(caster.mana).toBe(120)
    expect(caster.snapshot(1000).abilities?.casting?.targetId).toBe(target.id)
    expect(
        advanceRevive(
            caster,
            () => target,
            3999,
            () => 0,
            { ...context, now: 3999 }
        )
    ).toEqual([])
    expect(
        advanceRevive(
            caster,
            () => target,
            4000,
            () => 0,
            { ...context, now: 4000 }
        )
    ).toContainEqual(expect.objectContaining({ kind: 'revive' }))
    expect(caster.mana).toBe(100)
    expect(target.alive).toBe(true)
    target.applyDamage(target.hp, 5000)
    handleAbilityCommand(caster, message, { ...context, now: 6000 })
    target.tags.add('offline')
    expect(
        advanceRevive(
            caster,
            () => target,
            9000,
            () => 0,
            { ...context, now: 9000 }
        )
    ).toContainEqual(expect.objectContaining({ phase: 'interrupted' }))
    expect(caster.mana).toBe(100)
})
