import {
    ASH_RULES,
    type GameEventPayload,
    MASTERY_REWARDS,
    type PrayerActionId,
    profileForPrayer,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { resolveCharacterDamage } from './abilityDamage'
import type { GameCharacter } from './character'
import { miracleChance } from './deities'
import { prayerHarmTargets } from './prayerContext'
import { prayerHarmChance } from './prayerProbability'

export function applyAshBrand(
    actor: GameCharacter,
    targetId: string | undefined,
    context: AbilityContext,
    answered: boolean,
    quality: number
) {
    const target = answered
        ? prayerHarmTargets(actor, context, 'pray_grave').find(
              (candidate) => candidate.id === targetId
          )
        : undefined
    if (target === undefined) {
        return {
            events: [] as GameEventPayload[],
            meaningful: false,
            experience: 0,
        }
    }
    const damage = resolveCharacterDamage({
        actor,
        target,
        amount: Math.round(ASH_RULES.brandDamage * quality),
        now: context.now,
        damageKind: 'unholy',
        respawnDelayMs: context.respawnDelayMsFor?.(target) ?? 15_000,
    })
    const meaningful = damage.trainableDamage > 0
    return {
        events: damage.events.map((event) => ({
            ...event,
            abilityId: 'pray_grave' as const,
        })),
        meaningful,
        experience: meaningful ? MASTERY_REWARDS.ashBrand : 0,
    }
}

export function applyPrayerWave(
    actor: GameCharacter,
    context: AbilityContext,
    roll: number,
    quality: number,
    abilityId: PrayerActionId = 'pray'
) {
    if (abilityId !== 'pray') {
        return {
            events: [] as GameEventPayload[],
            meaningful: false,
            experience: 0,
        }
    }
    const victims = prayerHarmTargets(actor, context, abilityId)
    const chance = miracleChance(actor, context.now, 'hearth')
    const profile = profileForPrayer(abilityId)
    const events: GameEventPayload[] = []
    let meaningful = false
    let experience = 0
    const harm = Math.round(6 * quality)
    for (const victim of victims) {
        if (roll >= prayerHarmChance(chance)) {
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
        if (damage.trainableDamage > 0) {
            experience += MASTERY_REWARDS.prayerHarm
        }
    }
    return { events, meaningful, experience }
}
