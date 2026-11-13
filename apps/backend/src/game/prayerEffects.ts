import {
    DEITY_PRAYER_PROFILES,
    type GameEventPayload,
    PRAYER_RULES,
    type PrayerIntent,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { resolveCharacterDamage } from './abilityDamage'
import { consumeHealingProvenance } from './abilityState'
import type { GameCharacter } from './character'
import { restoreCharacter } from './characterRecovery'
import { miracleChance } from './deities'
import { canTargetByFaction } from './factions'
import { prayerHarmTargets, prayerResourceMissing } from './prayerContext'
import { trainSkill } from './skillProgression'

export function completePrayer(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    roll: number,
    quality: number
): GameEventPayload[] {
    const target =
        intent.targetId === actor.id
            ? actor
            : context.characters.find(
                  (candidate) => candidate.id === intent.targetId
              )
    const chance = miracleChance(actor, context.now)
    const events: GameEventPayload[] = []
    let meaningful = false
    let attemptMeaningful = meaningfulGiftAttempt(actor, target, intent)
    if (roll < chance && target !== undefined && intent.mode !== 'harm') {
        const gift = applyGift(actor, target, intent, context.now, quality)
        events.push(...gift.events)
        meaningful = gift.meaningful
    } else if (intent.mode !== 'harm') {
        events.push({
            kind: 'notice',
            actorId: actor.id,
            audienceIds: [actor.id],
            abilityId: 'pray',
            text: 'Божество не ответило на просьбу. Мана потрачена.',
        })
    }
    const wave = applyPrayerWave(actor, context, roll, quality)
    events.push(...wave.events)
    if (intent.mode === 'harm' && wave.events.length === 0) {
        events.push({
            kind: 'notice',
            actorId: actor.id,
            audienceIds: [actor.id],
            abilityId: 'pray',
            text: 'Божество не ответило на просьбу. Мана потрачена.',
        })
    }
    meaningful ||= wave.meaningful
    attemptMeaningful ||= wave.attemptMeaningful
    if (attemptMeaningful) {
        events.push(...trainSkill(actor, 'faith'))
    }
    if (meaningful) {
        events.push(...trainSkill(actor, 'miracles'))
    }
    return events
}
function meaningfulGiftAttempt(
    actor: GameCharacter,
    target: GameCharacter | undefined,
    intent: PrayerIntent
): boolean {
    return (
        intent.mode !== 'harm' &&
        target !== undefined &&
        (intent.mode === 'revive'
            ? meaningfulRevival(target)
            : meaningfulGift(actor, target))
    )
}
function meaningfulRevival(target: GameCharacter): boolean {
    return (
        target.maxHp -
            Math.min(target.maxHp, target.abilities.untrainableHpDamage) >
        0
    )
}
function meaningfulGift(actor: GameCharacter, target: GameCharacter): boolean {
    const missing = prayerResourceMissing(actor, target)
    return DEITY_PRAYER_PROFILES[actor.progression.patron].resource !== 'hp'
        ? missing > 0
        : missing - Math.min(missing, target.abilities.untrainableHpDamage) > 0
}
function applyGift(
    actor: GameCharacter,
    target: GameCharacter,
    intent: PrayerIntent,
    now: number,
    quality: number
): { events: GameEventPayload[]; meaningful: boolean } {
    if (intent.mode === 'revive') {
        const meaningful = meaningfulRevival(target)
        restoreCharacter(target, now, false)
        return {
            meaningful,
            events: [
                {
                    actorId: actor.id,
                    targetId: target.id,
                    kind: 'revive',
                    abilityId: 'pray',
                },
            ],
        }
    }
    const profile = DEITY_PRAYER_PROFILES[actor.progression.patron]
    const level = actor.progression.skills.miracles.level - 1
    const power =
        profile.resource === 'hp'
            ? 6 + level * 2
            : profile.resource === 'energy'
              ? 15 + level * 3
              : 12 + level * 2
    const missing = prayerResourceMissing(actor, target)
    const amount = Math.min(missing, Math.round(power * quality))
    if (amount <= 0) {
        return { events: [], meaningful: false }
    }
    let meaningful = true
    if (profile.resource === 'hp') {
        meaningful = consumeHealingProvenance(target, amount, missing) > 0
        target.hp += amount
    } else if (profile.resource === 'energy') {
        target.energy += amount
    } else {
        target.mana += amount
    }
    return {
        meaningful,
        events: [
            {
                kind: 'heal',
                actorId: actor.id,
                targetId: target.id,
                amount,
                abilityId: 'pray',
                text: profile.resource,
            },
        ],
    }
}

function applyPrayerWave(
    actor: GameCharacter,
    context: AbilityContext,
    roll: number,
    quality: number
): {
    events: GameEventPayload[]
    meaningful: boolean
    attemptMeaningful: boolean
} {
    const victims = prayerHarmTargets(actor, context)
    const chance = miracleChance(actor, context.now)
    const profile = DEITY_PRAYER_PROFILES[actor.progression.patron]
    const events: GameEventPayload[] = []
    let meaningful = false
    let attemptMeaningful = false
    const harm = Math.round(
        (6 +
            2 *
                (actor.progression.skills.miracles.level -
                    PRAYER_RULES.harmLevel)) *
            quality
    )
    for (const victim of victims) {
        const hostile =
            victim.id !== actor.id &&
            victim.faction !== actor.faction &&
            canTargetByFaction(actor, victim, context.now)
        attemptMeaningful ||= hostile
        if (roll >= Math.min(0.95, chance + PRAYER_RULES.harmChanceBonus)) {
            continue
        }
        const damage = resolveCharacterDamage({
            actor,
            target: victim,
            amount: harm,
            now: context.now,
            damageKind: profile.damageKind,
            respawnDelayMs: context.respawnDelayMsFor?.(victim) ?? 15000,
        })
        events.push(
            ...damage.events.map((event) => ({
                ...event,
                abilityId: 'pray' as const,
            }))
        )
        meaningful ||= damage.trainableDamage > 0
    }
    return { events, meaningful, attemptMeaningful }
}
