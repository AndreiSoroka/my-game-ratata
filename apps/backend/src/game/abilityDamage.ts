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
import { defersDefeatCredit } from './corpseReturnTrophy'
import { grantRetaliation, hasRetaliationRight } from './crimeRelations'
import { combatDeathEvent, damageEvent } from './damageEvents'
import { isPveOpponent } from './factions'
import { fatZombieBonuses } from './fatZombieModifiers'
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
import { observeSavvaAssault } from './savvaTerritory'
import { rewardSkeletonKill } from './skeletonKillReward'
import { awardMasteries, captureMasteryFactors } from './skillProgression'
import { interruptUndeadWindup } from './undeadCombat'
import {
    finishUndeadWound,
    graveLoanDamageMultiplier,
    guardUndeadHp,
} from './undeadSurvivalCombat'
import { undeadDamageMultiplier } from './undeadTactics'
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
    const { actor, target, now } = input
    const hostile =
        target.trainingTarget === undefined && isPveOpponent(actor, target)
    const auraEffects =
        input.targetAuraEffects ?? prayerAuraEffects(target, now)
    input = scaleIncomingDamage(input, hostile, auraEffects)
    if (!canReceiveDamage(input)) {
        return result
    }
    if (target.trainingTarget !== undefined) {
        result.impactDamage = input.amount
        result.events.push(damageEvent(input, input.amount))
        return result
    }
    if (hostile) {
        target.combat.recentDamageUntil = now + 1000
    }
    const factors = captureMasteryFactors(target)
    absorbDamage(input, result, hostile, factors)
    if (hostile && result.absorbed > 0) {
        resetMartyrStreak(actor)
    }
    const authorizedRetaliation = hasRetaliationRight(actor, target, now)
    markNonhostileContact(input, hostile, authorizedRetaliation)
    result.hpDamage = guardedHpDamage(input, result.absorbed, hostile)
    if (result.hpDamage > 0 || result.absorbed > 0) {
        observeSavvaAssault(actor, target, now)
    }
    if (result.hpDamage <= 0) {
        finishDefenderPractice(input, result, hostile, factors)
        return result
    }
    applyHpDamage(
        input,
        result,
        hostile,
        auraEffects.advantage,
        authorizedRetaliation
    )
    finishDefenderPractice(input, result, hostile, factors)
    finishDamageDeath(input, result.events, hostile)
    return result
}

function scaleIncomingDamage(
    input: CharacterDamageInput,
    hostile: boolean,
    auraEffects: PrayerAuraEffects
): CharacterDamageInput {
    const { actor, target, damageKind, now } = input
    const undeadMultiplier = hostile
        ? undeadDamageMultiplier(actor, target, damageKind, now) *
          graveLoanDamageMultiplier(target, damageKind, now)
        : 1
    const resistance =
        damageKind === 'physical'
            ? fatZombieBonuses(target).physicalResistance
            : 0
    const amount =
        input.amount *
        auraEffects.damageTakenMultiplier *
        undeadMultiplier *
        (1 - resistance)
    return {
        ...input,
        amount:
            input.roundFinal === true
                ? Math.max(1, Math.round(amount))
                : amount,
    }
}

function markNonhostileContact(
    { actor, target, now }: CharacterDamageInput,
    hostile: boolean,
    authorizedRetaliation: boolean
): void {
    if (actor.id !== target.id && !hostile && !authorizedRetaliation) {
        grantRetaliation(target, actor, now + 30_000)
    }
}

function guardedHpDamage(
    { actor, target, amount, damageKind, now }: CharacterDamageInput,
    absorbed: number,
    hostile: boolean
): number {
    const remaining = amount - absorbed
    return Math.min(
        target.hp,
        hostile
            ? guardUndeadHp(target, actor, remaining, damageKind, now)
            : remaining
    )
}

function applyHpDamage(
    input: CharacterDamageInput,
    result: DamageResolution,
    hostile: boolean,
    advantage: boolean,
    authorizedRetaliation: boolean
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
        if (target.alive) {
            interruptUndeadWindup(target, now)
            result.events.push(
                ...finishUndeadWound(target, result.hpDamage, now)
            )
        }
    }
    result.impactDamage = result.hpDamage
    result.events.push(
        damageEvent(input, result.hpDamage, authorizedRetaliation)
    )
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
    events.push(combatDeathEvent(actor, target, hostile))
    if (hostile && !defersDefeatCredit(target)) {
        events.push(...rewardSkeletonKill(actor, target, now, input.random))
    }
}
