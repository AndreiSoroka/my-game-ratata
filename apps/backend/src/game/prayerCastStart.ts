import {
    ABILITY_DEFINITIONS,
    type GameEventPayload,
    isMotherPrayer,
    PRAYER_SCHOOL_DEFINITIONS,
    type PrayerActionId,
    type PrayerIntent,
    prayerManaCost,
    prayerSchoolId,
} from '@my-game-ratata/contracts'

import { type AbilityContext, abilityNotice } from './abilityContext'
import { knowsAbility } from './abilityState'
import type { GameCharacter } from './character'
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
    const durationMs =
        plan?.durationMs ??
        prayerParameters(actor, context.navigation.grid.tileWidth, abilityId)
            .durationMs
    installCast(actor, intent, context.now, abilityId, durationMs, plan)
    if (plan !== undefined) {
        actor.mana = Math.max(0, actor.mana - plan.manaCost)
    }
    actor.abilities.lastPrayerAbilityId = abilityId
    actor.lockAction(context.now, durationMs)
    actor.setAnimation('attack', context.now, durationMs)
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
    durationMs: number,
    plan: MotherPrayerPlan | undefined
): void {
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
    actor.abilities.casting = {
        mode: intent.mode === 'purify_grave' ? 'purify_grave' : 'prayer',
        abilityId,
        intent: structuredClone(intent),
        targetId: plan?.targets[0]?.id ?? intentTarget(actor, intent),
        receiptId: `${actor.id}:prayer:${String(++actor.abilities.prayerSequence)}`,
        startedAt: now,
        completesAt: now + durationMs,
        patron: PRAYER_SCHOOL_DEFINITIONS[prayerSchoolId(abilityId)].deityId,
        origin: { ...actor.position },
        locationId: actor.locationId,
        hpAtStart: actor.hp,
        ...(plan === undefined
            ? {}
            : { plan, mother: motherPrayerAuraState(actor, plan) }),
    }
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
