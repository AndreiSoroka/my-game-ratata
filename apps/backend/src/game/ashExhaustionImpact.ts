import {
    ASH_RULES,
    type GameEventPayload,
    MASTERY_REWARDS,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { resolveCharacterDamage } from './abilityDamage'
import { ashExhaustionHostile, curseWithAshExhaustion } from './ashExhaustion'
import type { GameCharacter } from './character'
import { miracleChance } from './deities'
import type { ExhaustionProjectile } from './magicProjectiles'
import {
    confirmCombatResourceSpend,
    reconcileResourceCapacity,
} from './resourcePractice'
import { awardMasteries } from './skillProgression'

export function resolveAshExhaustionImpact(
    projectile: ExhaustionProjectile,
    target: GameCharacter | undefined,
    context: AbilityContext
): GameEventPayload[] {
    const { abilityId, id, actor, rank, random } = projectile
    const { now, sameParty } = context
    if (
        target === undefined ||
        !ashExhaustionHostile(actor, target, now, sameParty)
    ) {
        return []
    }
    const result = resolveCharacterDamage({
        actor,
        target,
        amount: ASH_RULES.exhaustion.drain,
        now,
        damageKind: 'unholy',
        respawnDelayMs: context.respawnDelayMsFor?.(target) ?? 15_000,
        random,
    })
    target.mana = Math.max(0, target.mana - ASH_RULES.exhaustion.drain)
    target.drainEnergy(ASH_RULES.exhaustion.drain)
    confirmCombatResourceSpend(
        actor,
        target,
        result,
        [projectile.resourceSpend],
        now
    )
    if (target.alive) {
        reconcileResourceCapacity(target, 'mana')
        reconcileResourceCapacity(target, 'energy')
    }
    const events = result.events.map((event): GameEventPayload => ({
        ...event,
        actionId: id,
        attackOrigin: 'ability',
        abilityId: event.abilityId ?? abilityId,
        delivery: 'magic',
    }))
    const chance =
        miracleChance(actor, now, 'grave') + ASH_RULES.exhaustion.chanceBonus
    if (target.alive && random() < chance) {
        const expiresAt = curseWithAshExhaustion(target, rank, now)
        if (expiresAt !== undefined) {
            events.push({
                kind: 'status',
                actorId: actor.id,
                targetId: target.id,
                audienceIds: [target.id],
                actionId: id,
                abilityId,
                statusId: 'ash_exhaustion',
                expiresAt,
            })
        }
    }
    if (result.trainableDamage > 0 && actor.alive) {
        events.push(
            ...awardMasteries(
                actor,
                [
                    {
                        constellationId: 'prayer_grave',
                        experience: MASTERY_REWARDS.ashBrand,
                    },
                ],
                {
                    now,
                    random,
                    factors: projectile.factors,
                    evidence: [abilityId],
                }
            )
        )
    }
    return events
}
