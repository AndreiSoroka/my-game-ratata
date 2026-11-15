import {
    type AbilityClientMessage,
    creatureTypes,
    previewPrayerFromSnapshots,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import type { AbilityContext } from '../src/game/abilityContext'
import { resolveCharacterDamage } from '../src/game/abilityDamage'
import type { GameCharacter } from '../src/game/character'
import { advanceRevive } from '../src/game/characterLife'
import { miracleChance } from '../src/game/deities'
import { prayerHarmTargets, previewPrayer } from '../src/game/prayerContext'
import { abilityContext, abilityHero } from './abilityTestHelpers'
import { masteryExperience, prayerXp } from './prayerMasteryTestHelpers'

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
        target.hp -= 25
        expect(
            handleAbilityCommand(caster, prayer(target.id), context)[0]?.phase
        ).toBe('started')
        expect(caster.mana).toBe(120)
        expect(
            advanceRevive(caster, () => target, 3999, context.random, {
                ...context,
                now: 3999,
            })
        ).toEqual([])
        expect(masteryExperience(caster, 'prayer')).toBe(prayerXp(0))
        expect(
            advanceRevive(caster, () => target, 4000, context.random, {
                ...context,
                now: 4000,
            })
        ).toContainEqual(
            expect.objectContaining({ kind: 'heal', targetId: target.id })
        )
        expect(caster.mana).toBe(115)
        expect(masteryExperience(caster, 'prayer')).toBe(prayerXp(30))
        // The next attempt starts immediately at the completion boundary.
        expect(
            handleAbilityCommand(caster, prayer(target.id), {
                ...context,
                now: 4000,
            })[0]?.phase
        ).toBe('started')
        expect(caster.mana).toBe(115)
        advanceRevive(caster, () => target, 7000, context.random, {
            ...context,
            now: 7000,
        })
        expect(caster.mana).toBe(110)
    }
)
it('keeps a failed miracle probabilistic and paid without granting mastery experience', () => {
    const caster = abilityHero()
    caster.hp -= 10
    const events = castPrayer(
        caster,
        prayer(caster.id),
        abilityContext([caster], 1000, () => 1)
    )
    expect(events.some((event) => event.kind === 'heal')).toBe(false)
    expect(caster.mana).toBe(115)
    expect(masteryExperience(caster, 'prayer')).toBe(prayerXp(0))
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
        castPrayer(caster, prayer(target.id), context).some(
            (event) => event.kind === 'cast'
        )
    ).toBe(false)
    expect(caster.mana).toBe(120)
    expect(caster.abilities.casting).toBe(null)
})
it('uses the unlocked wave on all undead including allies, with one roll and no XP from friendly harm', () => {
    const caster = abilityHero()
    caster.hp -= 10
    const allies = [
        abilityHero('vanguard', 'undead'),
        abilityHero('vanguard', 'undead'),
    ]
    const context = abilityContext([caster, ...allies], 1000)

    expect(prayerHarmTargets(caster, context)).toEqual([])

    caster.progression.constellations.opened.add('prayer.harm')
    let rolls = 0
    context.random = () => {
        rolls += 1
        return miracleChance(caster, context.now) + 0.01
    }
    const before = allies.map((target) => target.hp)
    const events = castPrayer(caster, prayer(caster.id), context)
    expect(events.filter((event) => event.kind === 'damage')).toHaveLength(2)
    expect(events.some((event) => event.kind === 'heal')).toBe(false)
    expect(rolls).toBe(1)
    expect(
        allies.every((target, index) => target.hp < (before[index] ?? 0))
    ).toBe(true)
    expect(masteryExperience(caster, 'prayer')).toBe(prayerXp(0))
})
it('restores only undead through the grave school without inheriting a harmful wave', () => {
    const caster = abilityHero()
    caster.abilities.known.add('pray_grave')
    caster.progression.constellations.opened.add('prayer.harm')
    const actors = creatureTypes.map((type) => abilityHero('vanguard', type))
    const context = abilityContext([caster, ...actors])
    expect(prayerHarmTargets(caster, context, 'pray_grave')).toEqual([])
    const undead = actors.find((actor) => actor.creatureType === 'undead')
    if (undead === undefined) {
        throw new Error('Missing undead fixture')
    }
    undead.hp -= 10
    const before = actors
        .filter((actor) => actor !== undead)
        .map((actor) => actor.hp)
    const events = castPrayer(
        caster,
        {
            type: 'use_ability',
            abilityId: 'pray_grave',
            intent: { mode: 'restore', targetId: undead.id },
        },
        context
    )
    expect(
        events.some(
            (event) => event.kind === 'heal' && event.targetId === undead.id
        )
    ).toBe(true)
    expect(events.some((event) => event.kind === 'damage')).toBe(false)
    expect(
        actors.filter((actor) => actor !== undead).map((actor) => actor.hp)
    ).toEqual(before)
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
    const events = castPrayer(actor, prayer(target.id), {
        ...abilityContext([actor, target]),
        now: 31_000,
    })
    expect(events.some((event) => event.kind === 'heal')).toBe(true)
    expect(masteryExperience(actor, 'prayer')).toBe(prayerXp(0))
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

function castPrayer(
    actor: GameCharacter,
    message: AbilityClientMessage,
    context: AbilityContext
) {
    const events = handleAbilityCommand(actor, message, context)
    const cast = actor.abilities.casting
    return cast === null
        ? events
        : [
              ...events,
              ...advanceRevive(
                  actor,
                  (id) => context.characters.find((target) => target.id === id),
                  cast.completesAt,
                  context.random,
                  { ...context, now: cast.completesAt }
              ),
          ]
}
