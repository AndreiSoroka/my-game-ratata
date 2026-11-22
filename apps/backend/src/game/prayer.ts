import {
    type GameEventPayload,
    isMotherPrayer,
    type PrayerActionId,
    type PrayerIntent,
    prayerManaCost,
} from '@my-game-ratata/contracts'

import { type AbilityContext, abilityNotice } from './abilityContext'
import type { GameCharacter } from './character'
import { beginRevive } from './characterLife'
import { constellationModifiers } from './constellationModifiers'
import { resolveMiracle } from './deities'
import {
    advanceMotherPrayerTicks,
    completeMotherPrayer,
} from './motherPrayerEffects'
import { hasMotherPrayerAura } from './motherPrayerPlan'
import {
    ensurePrayerAuraEnvironment,
    hasPrayerAdvantage,
    prayerCheckSample,
} from './prayerAuras'
import { cancelPrayerCast, releasePrayerCast } from './prayerCancellation'
import {
    beginPrayerCast,
    canStartPrayer,
    decorativePrayer,
    prayerTarget,
} from './prayerCastStart'
import {
    type ActivePrayerCast,
    prayerChannelValid,
} from './prayerChannelValidation'
import { resolvePrayerIntent, validPrayerIntent } from './prayerContext'
import { completePrayer } from './prayerEffects'
import { prayerParameters, setPrayerAvailableAt } from './prayerParameters'
export { beginPrayerCast } from './prayerCastStart'
export { validatePrayerChannel } from './prayerChannelValidation'

export function pray(
    actor: GameCharacter,
    now: number,
    random?: () => number,
    context?: AbilityContext,
    pinnedIntent?: PrayerIntent,
    abilityId: PrayerActionId = 'pray'
): GameEventPayload[] {
    if (context === undefined) {
        return abilityNotice(actor, 'Выберите цель молитвы.')
    }
    const actualContext = {
        ...context,
        now,
        ...(random !== undefined ? { random } : {}),
    }
    ensurePrayerAuraEnvironment(actor, actualContext)
    const intent =
        pinnedIntent ??
        resolvePrayerIntent(actor, actualContext, undefined, abilityId)
    if (!canStartPrayer(actor, now, abilityId)) {
        return abilityNotice(
            actor,
            'Молитва сейчас недоступна: проверьте состояние и откат.'
        )
    }
    if (isMotherPrayer(abilityId)) {
        return startMotherPrayer(actor, intent, actualContext, abilityId)
    }
    return startOtherPrayer(actor, intent, actualContext, abilityId)
}

function startMotherPrayer(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    abilityId: PrayerActionId
): GameEventPayload[] {
    const cosmetic =
        intent.mode === 'devotion' &&
        !hasMotherPrayerAura(actor) &&
        !constellationModifiers(actor).prayerLastLight
    return cosmetic
        ? decorativePrayer(actor, context.now, abilityId)
        : beginPrayerCast(actor, intent, context, abilityId)
}

function startOtherPrayer(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    abilityId: PrayerActionId
): GameEventPayload[] {
    if (!validPrayerIntent(actor, intent, context, abilityId)) {
        return abilityNotice(
            actor,
            'Молитва сейчас не найдёт подходящего ответа.'
        )
    }
    if (actor.mana < prayerManaCost(intent.mode, abilityId)) {
        return abilityNotice(actor, 'Недостаточно маны для молитвы.')
    }
    if (intent.mode === 'revive') {
        return startOtherRevival(actor, intent.targetId, context, abilityId)
    }
    return intent.mode === 'devotion'
        ? decorativePrayer(actor, context.now, abilityId)
        : beginPrayerCast(actor, intent, context, abilityId)
}

function startOtherRevival(
    actor: GameCharacter,
    targetId: string | undefined,
    context: AbilityContext,
    abilityId: PrayerActionId
): GameEventPayload[] {
    const target = context.characters.find(
        (candidate) => candidate.id === targetId
    )
    if (
        target === undefined ||
        !beginRevive(actor, target, context.now, context, abilityId)
    ) {
        return abilityNotice(actor, 'Воскрешение сейчас невозможно.')
    }
    return [
        {
            kind: 'cast',
            actorId: actor.id,
            targetId: target.id,
            abilityId,
            statusId: 'reviving',
            phase: 'started',
            expiresAt:
                context.now +
                prayerParameters(
                    actor,
                    context.navigation.grid.tileWidth,
                    abilityId
                ).durationMs,
        },
    ]
}

export function advancePrayerCast(
    actor: GameCharacter,
    now: number,
    context?: AbilityContext,
    random?: () => number
): GameEventPayload[] {
    const cast = actor.abilities.casting
    if (cast?.mode !== 'prayer' && cast?.mode !== 'purify_grave') {
        return []
    }
    if (context === undefined) {
        return cancelPrayerCast(actor, now)
    }
    const actualContext = {
        ...context,
        now,
        ...(random !== undefined ? { random } : {}),
    }
    if (!prayerChannelValid(actor, cast, actualContext)) {
        return cancelPrayerCast(actor, now)
    }
    const ticks = advanceMotherPrayerTicks(actor, cast, actualContext)
    if (now < cast.completesAt) {
        return ticks
    }
    return [
        ...ticks,
        ...(cast.plan === undefined
            ? finishOtherPrayer(actor, cast, actualContext)
            : finishMotherPrayer(actor, cast, actualContext)),
    ]
}

function finishMotherPrayer(
    actor: GameCharacter,
    cast: ActivePrayerCast,
    context: AbilityContext
): GameEventPayload[] {
    const plan = cast.plan
    if (plan === undefined) {
        return []
    }
    plan.resolving = true
    try {
        const events = completeMotherPrayer(actor, cast, context)
        actor.abilities.prayerAurasSuppressed = false
        setPrayerAvailableAt(
            actor,
            cast.abilityId,
            context.now + (plan.lastLight ? 10000 : 0)
        )
        return [
            {
                kind: 'cast',
                actorId: actor.id,
                abilityId: cast.abilityId,
                phase: 'completed',
                ...prayerTarget(cast.intent),
            },
            ...events,
        ]
    } finally {
        releasePrayerCast(actor, context.now)
    }
}

function finishOtherPrayer(
    actor: GameCharacter,
    cast: ActivePrayerCast,
    context: AbilityContext
): GameEventPayload[] {
    const cost =
        cast.road === undefined
            ? prayerManaCost(cast.intent.mode, cast.abilityId)
            : 0
    if (actor.mana < cost) {
        return cancelPrayerCast(actor, context.now)
    }
    const random = context.random ?? Math.random
    const advantage = hasPrayerAdvantage(actor, context.now)
    const roll = prayerCheckSample(random, advantage)
    releasePrayerCast(actor, context.now)
    actor.mana -= cost
    setPrayerAvailableAt(actor, cast.abilityId, context.now)
    const outcome = resolveMiracle(actor, context.now, () => roll, cast.patron)
    return [
        {
            kind: 'cast',
            actorId: actor.id,
            abilityId: cast.abilityId,
            phase: 'completed',
            ...prayerTarget(cast.intent),
        },
        ...completePrayer(
            actor,
            cast.intent,
            { ...context, random: () => prayerCheckSample(random, advantage) },
            roll,
            outcome.quality,
            cast.receiptId,
            cast.abilityId,
            cast.road
        ),
    ]
}
