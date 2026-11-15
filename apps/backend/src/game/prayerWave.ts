import {
    type GameEventPayload,
    PRAYER_RULES,
    type PrayerAbilityId,
    profileForPrayer,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { resolveCharacterDamage } from './abilityDamage'
import type { GameCharacter } from './character'
import { miracleChance } from './deities'
import { canTargetByFaction } from './factions'
import { prayerHarmTargets } from './prayerContext'

export function applyPrayerWave(
    actor: GameCharacter,
    context: AbilityContext,
    roll: number,
    quality: number,
    abilityId: PrayerAbilityId = 'pray'
) {
    if (abilityId !== 'pray') {
        return {
            events: [] as GameEventPayload[],
            meaningful: false,
            attemptMeaningful: false,
        }
    }
    const victims = prayerHarmTargets(actor, context, abilityId)
    const chance = miracleChance(actor, context.now, 'hearth')
    const profile = profileForPrayer(abilityId)
    const events: GameEventPayload[] = []
    let meaningful = false
    let attemptMeaningful = false
    const harm = Math.round(
        (6 +
            2 *
                Math.max(
                    0,
                    actor.progression.skills.miracles.level -
                        PRAYER_RULES.harmLevel
                )) *
            quality
    )
    for (const victim of victims) {
        const hostile =
            victim.id !== actor.id &&
            victim.faction !== actor.faction &&
            victim.trainingTarget === undefined &&
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
