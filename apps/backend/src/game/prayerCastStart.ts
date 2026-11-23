import {
    ABILITY_DEFINITIONS,
    type GameEventPayload,
    isMotherPrayer,
    PRAYER_SCHOOL_DEFINITIONS,
    type PrayerActionId,
    type PrayerIntent,
    prayerManaCost,
    type PrayerParametersSnapshot,
    prayerSchoolId,
} from '@my-game-ratata/contracts'

import { type AbilityContext, abilityNotice } from './abilityContext'
import { knowsAbility, nextPrayerReceipt } from './abilityState'
import { planAshSecondaryHeal } from './ashPrayerTargets'
import type { GameCharacter } from './character'
import { ashParameters } from './constellationModifiers'
import { hasStar } from './constellations'
import {
    motherPrayerAuraState,
    type MotherPrayerPlan,
    planMotherPrayer,
} from './motherPrayerPlan'
import { ensurePrayerAuraEnvironment } from './prayerAuras'
import { validPrayerIntent } from './prayerContext'
import {
    prayerAvailableAt,
    prayerParameters,
    setPrayerAvailableAt,
} from './prayerParameters'
import { canPerformSkillAction } from './skillProgression'

export function canStartPrayer(
    actor: GameCharacter,
    now: number,
    action: PrayerActionId
): boolean {
    return (
        actor.abilities.casting === null &&
        knowsAbility(actor, action) &&
        canPerformSkillAction(actor, now) &&
        now >= prayerAvailableAt(actor, action)
    )
}

export function beginPrayerCast(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    abilityId: PrayerActionId = 'pray'
): GameEventPayload[] {
    if (!canStartPrayer(actor, context.now, abilityId)) {
        return abilityNotice(actor, 'Молитву сейчас нельзя начать.')
    }
    ensurePrayerAuraEnvironment(actor, context)
    const plan = isMotherPrayer(abilityId)
        ? planMotherPrayer(actor, intent, context, abilityId)
        : undefined
    if (!validCastPlan(actor, intent, context, abilityId, plan)) {
        return abilityNotice(
            actor,
            'Молитву сейчас нельзя начать: проверьте цель и ману.'
        )
    }
    const parameters = prayerParameters(
        actor,
        context.navigation.grid.tileWidth,
        abilityId,
        intent.mode
    )
    const durationMs = plan?.durationMs ?? parameters.durationMs
    const secondaryTargetId = planAshSecondaryHeal(
        actor,
        intent,
        context,
        abilityId,
        parameters.manaCost
    )
    installCast(
        actor,
        intent,
        context.now,
        abilityId,
        parameters,
        plan,
        secondaryTargetId
    )
    if (plan !== undefined) {
        actor.mana = Math.max(0, actor.mana - plan.manaCost)
    } else if (abilityId === 'pray_road') {
        actor.mana -= prayerManaCost(intent.mode, abilityId)
        actor.movement.dashUntil = 0
    }
    actor.abilities.lastPrayerAbilityId = abilityId
    actor.lockAction(context.now, durationMs)
    if (
        actor.abilities.casting?.mode !== 'prayer' ||
        actor.abilities.casting.walkWhileCasting !== true
    ) {
        actor.setAnimation('attack', context.now, durationMs)
    }
    return [
        {
            kind: 'cast',
            actorId: actor.id,
            abilityId,
            phase: 'started',
            ...prayerTarget(intent),
            expiresAt: context.now + durationMs,
            durationMs,
        },
    ]
}

function validCastPlan(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    action: PrayerActionId,
    plan: MotherPrayerPlan | undefined
): boolean {
    if (isMotherPrayer(action)) {
        return plan !== undefined
    }
    return (
        intent.mode !== 'devotion' &&
        intent.mode !== 'revive' &&
        validPrayerIntent(actor, intent, context, action) &&
        actor.mana >= prayerManaCost(intent.mode, action)
    )
}

function installCast(
    actor: GameCharacter,
    intent: PrayerIntent,
    now: number,
    abilityId: PrayerActionId,
    parameters: PrayerParametersSnapshot,
    plan: MotherPrayerPlan | undefined,
    secondaryTargetId?: string
): void {
    const walkWhileCasting = walkingChannel(actor, intent, abilityId)
    if (walkWhileCasting) {
        actor.movement.mode = 'walking'
    } else {
        actor.clearPath()
        actor.setMoveInput({ x: 0, y: 0 })
    }
    actor.abilities.casting = {
        mode: intent.mode === 'purify_grave' ? 'purify_grave' : 'prayer',
        abilityId,
        intent: structuredClone(intent),
        targetId: plan?.targets[0]?.id ?? intentTarget(actor, intent),
        receiptId: nextPrayerReceipt(actor),
        startedAt: now,
        completesAt: now + (plan?.durationMs ?? parameters.durationMs),
        patron: PRAYER_SCHOOL_DEFINITIONS[prayerSchoolId(abilityId)].deityId,
        origin: { ...actor.position },
        locationId: actor.locationId,
        hpAtStart: actor.hp,
        radius: parameters.radius,
        ...(secondaryTargetId === undefined
            ? {}
            : { ashSecondaryTargetId: secondaryTargetId }),
        ...(walkWhileCasting ? { walkWhileCasting } : {}),
        ...(parameters.energyRecoveryRadius === undefined
            ? {}
            : {
                  road: {
                      recoveryRadius: parameters.energyRecoveryRadius,
                      restoredTarget: false,
                      usefulRecovery: 0,
                      shoulder: hasStar(actor, 'prayer_road.shoulder'),
                  },
              }),
        ...(plan === undefined
            ? {}
            : { plan, mother: motherPrayerAuraState(actor, plan) }),
    }
}

function walkingChannel(
    actor: GameCharacter,
    intent: PrayerIntent,
    abilityId: PrayerActionId
): boolean {
    return (
        (abilityId === 'pray_road' && hasStar(actor, 'prayer_road.walk')) ||
        (abilityId === 'pray_grave' &&
            intent.mode === 'restore' &&
            ashParameters(actor).healWalking)
    )
}

function intentTarget(actor: GameCharacter, intent: PrayerIntent): string {
    return intent.mode === 'purify_grave'
        ? intent.target.id
        : (intent.targetId ?? actor.id)
}

export function decorativePrayer(
    actor: GameCharacter,
    now: number,
    abilityId: PrayerActionId
): GameEventPayload[] {
    setPrayerAvailableAt(
        actor,
        abilityId,
        now + ABILITY_DEFINITIONS[abilityId].cooldownMs
    )
    actor.abilities.lastPrayerAbilityId = abilityId
    actor.lockAction(now, 400)
    actor.setAnimation('idle', now, 400)
    return [{ kind: 'cast', actorId: actor.id, abilityId, phase: 'completed' }]
}

export function prayerTarget(intent: PrayerIntent) {
    return intent.mode === 'purify_grave'
        ? { target: intent.target }
        : intent.targetId === undefined
          ? {}
          : { targetId: intent.targetId }
}
