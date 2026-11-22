import type {
    CombatHitQuality,
    ConstellationId,
    DamageKind,
    GameEventPayload,
} from '@my-game-ratata/contracts'
import { MASTERY_REWARDS } from '@my-game-ratata/contracts'

import { activeBarrier } from './abilityState'
import type { GameCharacter } from './character'
import { constellationModifiers } from './constellationModifiers'
import { grantRetaliation, hasDirectRetaliationRight } from './crimeRelations'
import { canTargetByFaction } from './factions'
import { wearHitEquipment } from './itemDurability'
import { cancelMagicChannel } from './magicState'
import { recordMartyrHostileDamage, resetMartyrStreak } from './martyr'
import {
    type PrayerAuraEffects,
    prayerAuraEffects,
    prayerDamageInterrupts,
} from './prayerAuras'
import { cancelPrayerCast } from './prayerCancellation'
import { confirmResourceSpend, recordResourceSpend } from './resourcePractice'
import { rewardSkeletonKill } from './skeletonKillReward'
import { awardMasteries, captureMasteryFactors } from './skillProgression'
import { recordVitalityDamage } from './vitalityPractice'
export interface DamageResolution {
    /** Resolved contact used for weapon wear, independent of target HP loss. */
    impactDamage: number
    hpDamage: number
    absorbed: number
    trainableDamage: number
    events: GameEventPayload[]
}
export interface CharacterDamageInput {
    roundFinal?: boolean
    hitQuality?: CombatHitQuality
    actor: GameCharacter
    target: GameCharacter
    amount: number
    now: number
    damageKind: DamageKind
    respawnDelayMs: number
    random?: () => number
    targetAuraEffects?: PrayerAuraEffects
}
export function resolveCharacterDamage(
    input: CharacterDamageInput
): DamageResolution {
    const { actor, target, now } = input
    const auraEffects =
        input.targetAuraEffects ?? prayerAuraEffects(target, now)
    const amount = input.amount * auraEffects.damageTakenMultiplier
    input = {
        ...input,
        amount:
            input.roundFinal === true
                ? Math.max(1, Math.round(amount))
                : amount,
    }
    const result: DamageResolution = {
        impactDamage: 0,
        hpDamage: 0,
        absorbed: 0,
        trainableDamage: 0,
        events: [],
    }
    if (!canReceiveDamage(input)) {
        return result
    }
    if (target.trainingTarget !== undefined) {
        result.impactDamage = input.amount
        result.events.push(damageEvent(input, input.amount))
        return result
    }
    const hostile = hostileDamage(input)
    if (hostile) {
        target.combat.recentDamageUntil = now + 1000
    }
    const factors = captureMasteryFactors(target)
    absorbDamage(input, result, hostile, factors)
    if (hostile && result.absorbed > 0) {
        resetMartyrStreak(actor)
    }
    if (
        actor.id !== target.id &&
        !hostile &&
        !hasDirectRetaliationRight(actor, target, now)
    ) {
        grantRetaliation(target, actor, now + 30_000)
    }
    result.hpDamage = Math.min(target.hp, input.amount - result.absorbed)
    if (result.hpDamage <= 0) {
        finishDefenderPractice(input, result, hostile, factors)
        return result
    }
    applyHpDamage(input, result, hostile, auraEffects.advantage)
    finishDefenderPractice(input, result, hostile, factors)
    finishDamageDeath(input, result.events, hostile)
    return result
}

function hostileDamage({ actor, target, now }: CharacterDamageInput): boolean {
    return (
        actor.id !== target.id &&
        actor.faction !== target.faction &&
        canTargetByFaction(actor, target, now)
    )
}

function applyHpDamage(
    input: CharacterDamageInput,
    result: DamageResolution,
    hostile: boolean,
    advantage: boolean
): void {
    const { actor, target, now } = input
    const tainted = Math.min(
        target.abilities.untrainableHpDamage,
        Math.max(0, target.maxHp - target.hp)
    )
    target.applyDamage(result.hpDamage, now)
    result.events.push(...cancelMagicChannel(target, now))
    wearHitEquipment(target)
    if (
        !target.alive ||
        prayerDamageInterrupts(target, now, input.random, advantage)
    ) {
        result.events.push(...cancelPrayerCast(target, now))
    }
    target.abilities.untrainableHpDamage = Math.min(
        Math.max(0, target.maxHp - target.hp),
        tainted + (hostile ? 0 : result.hpDamage)
    )
    result.trainableDamage = hostile ? result.hpDamage : 0
    if (hostile) {
        recordMartyrHostileDamage(target, result.hpDamage, now)
        resetMartyrStreak(actor)
    }
    result.impactDamage = result.hpDamage
    result.events.push(damageEvent(input, result.hpDamage))
}
function finishDefenderPractice(
    input: CharacterDamageInput,
    result: DamageResolution,
    hostile: boolean,
    factors: Record<ConstellationId, number>
): void {
    if (hostile && result.hpDamage > 0) {
        result.events.push(
            ...recordVitalityDamage(
                input.target,
                result.hpDamage,
                input.now,
                false,
                factors
            )
        )
    }
}

function damageEvent(
    input: CharacterDamageInput,
    amount: number
): GameEventPayload {
    return {
        kind: 'damage',
        actorId: input.actor.id,
        targetId: input.target.id,
        amount,
        damageKind: input.damageKind,
        hitQuality: input.hitQuality ?? 'normal',
    }
}
function canReceiveDamage({ target, amount }: CharacterDamageInput): boolean {
    return (
        target.alive &&
        !target.tags.has('offline') &&
        !target.tags.has('state.retired') &&
        Number.isFinite(amount) &&
        amount > 0
    )
}
function absorbDamage(
    input: CharacterDamageInput,
    result: DamageResolution,
    hostile: boolean,
    factors: Record<ConstellationId, number>
): void {
    const { actor, target, now, damageKind } = input
    const barrier = activeBarrier(target, now)
    if (barrier === null) {
        return
    }
    const rate = constellationModifiers(target).barrierManaPerDamage
    const paid = Math.min(target.mana, input.amount * rate)
    target.mana -= paid
    result.absorbed = paid === input.amount * rate ? input.amount : paid / rate
    const spend = recordResourceSpend(target, 'mana', paid)
    result.events.push({
        kind: 'absorb',
        actorId: actor.id,
        targetId: target.id,
        amount: result.absorbed,
        hitQuality: input.hitQuality ?? 'normal',
        damageKind,
        statusId: 'barrier',
    })
    if (hostile) {
        confirmResourceSpend(spend)
        if (!barrier.practiced) {
            barrier.practiced = true
            result.events.push(
                ...awardMasteries(
                    target,
                    [
                        {
                            constellationId: 'magic',
                            experience: MASTERY_REWARDS.barrierAbsorb,
                        },
                    ],
                    { now, evidence: ['barrier'], factors }
                )
            )
        }
    }
    if (target.mana <= 0) {
        target.abilities.barrier = null
    }
}
function finishDamageDeath(
    input: CharacterDamageInput,
    events: GameEventPayload[],
    hostile: boolean
): void {
    const { actor, target, now } = input
    if (target.alive) {
        return
    }
    target.abilities.barrier = null
    target.abilities.casting = null
    target.queueRespawn(now, input.respawnDelayMs)
    events.push({ kind: 'death', actorId: actor.id, targetId: target.id })
    if (hostile) {
        events.push(...rewardSkeletonKill(actor, target, now, input.random))
    }
}
