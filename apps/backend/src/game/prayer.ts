import {
    ABILITY_DEFINITIONS,
    type GameEventPayload,
    type PrayerIntent,
    prayerManaCost,
} from '@my-game-ratata/contracts'

import { type AbilityContext, abilityNotice } from './abilityContext'
import type { PrayerCast } from './abilityState'
import type { GameCharacter } from './character'
import { beginRevive } from './characterLife'
import { resolveMiracle } from './deities'
import { cancelPrayerCast, releasePrayerCast } from './prayerCancellation'
import { resolvePrayerIntent, validPrayerIntent } from './prayerContext'
import { completePrayer } from './prayerEffects'
import { prayerParameters } from './prayerParameters'
import { canPerformSkillAction } from './skillProgression'

export function pray(
    actor: GameCharacter,
    now: number,
    random?: () => number,
    context?: AbilityContext,
    pinnedIntent?: PrayerIntent
): GameEventPayload[] {
    if (context === undefined) {
        return abilityNotice(actor, 'Выберите цель молитвы.')
    }
    const intent = pinnedIntent ?? resolvePrayerIntent(actor, context)
    if (
        !canPerformSkillAction(actor, now) ||
        !validPrayerIntent(actor, intent, context) ||
        actor.abilities.casting !== null
    ) {
        return abilityNotice(
            actor,
            'Молитва сейчас не найдёт подходящего ответа.'
        )
    }
    if (
        now <
        Math.max(
            actor.progression.prayerAvailableAt,
            actor.abilities.availableAt.pray ?? 0
        )
    ) {
        return abilityNotice(actor, 'Молитва ещё восстанавливается.')
    }
    if (actor.mana < prayerManaCost(intent.mode)) {
        return abilityNotice(actor, 'Недостаточно маны для молитвы.')
    }
    if (intent.mode === 'revive') {
        return startRevivalPrayer(actor, intent, context)
    }
    if (intent.mode === 'devotion') {
        actor.progression.prayerAvailableAt =
            now + ABILITY_DEFINITIONS.pray.cooldownMs
        actor.abilities.availableAt.pray = actor.progression.prayerAvailableAt
        actor.lockAction(now, 400)
        actor.setAnimation('idle', now, 400)
        return [
            {
                kind: 'cast',
                actorId: actor.id,
                abilityId: 'pray',
                phase: 'completed',
            },
        ]
    }
    // Randomness is consumed only by a valid completed attempt.
    return beginPrayerCast(actor, intent, {
        ...context,
        ...(random !== undefined ? { random } : {}),
    })
}

export function beginPrayerCast(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext
): GameEventPayload[] {
    if (
        intent.mode === 'devotion' ||
        intent.mode === 'revive' ||
        actor.abilities.casting !== null ||
        !canPerformSkillAction(actor, context.now) ||
        !validPrayerIntent(actor, intent, context) ||
        context.now <
            Math.max(
                actor.progression.prayerAvailableAt,
                actor.abilities.availableAt.pray ?? 0
            ) ||
        actor.mana < prayerManaCost(intent.mode)
    ) {
        return abilityNotice(actor, 'Молитву сейчас нельзя начать.')
    }
    const durationMs = prayerParameters(
        actor,
        context.navigation.grid.tileWidth
    ).durationMs
    const now = context.now
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
    actor.abilities.casting = {
        mode: intent.mode === 'purify_grave' ? 'purify_grave' : 'prayer',
        intent: structuredClone(intent),
        targetId:
            intent.mode === 'purify_grave'
                ? intent.target.id
                : (intent.targetId ?? actor.id),
        receiptId: `${actor.id}:prayer:${String(++actor.abilities.prayerSequence)}`,
        startedAt: now,
        completesAt: now + durationMs,
        patron: actor.progression.patron,
        origin: { ...actor.position },
        locationId: actor.locationId,
        hpAtStart: actor.hp,
    }
    actor.lockAction(now, durationMs)
    actor.setAnimation('attack', now, durationMs)
    return [
        {
            kind: 'cast',
            actorId: actor.id,
            abilityId: 'pray',
            phase: 'started',
            ...prayerTarget(intent),
            expiresAt: now + durationMs,
            durationMs,
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
    if (
        context === undefined ||
        prayerInterrupted(actor, cast, now) ||
        !validPrayerIntent(actor, cast.intent, { ...context, now })
    ) {
        return cancelPrayerCast(actor, now)
    }
    if (now < cast.completesAt) {
        return []
    }
    if (actor.mana < prayerManaCost(cast.intent.mode)) {
        return cancelPrayerCast(actor, now)
    }
    // Release before resolving events: a repeated tick cannot resolve this cast again.
    releasePrayerCast(actor, now)
    actor.mana -= prayerManaCost(cast.intent.mode)
    actor.progression.prayerAvailableAt = now
    actor.abilities.availableAt.pray = now
    const roll = (random ?? context.random ?? Math.random)()
    const outcome = resolveMiracle(actor, now, () => roll)
    return [
        {
            kind: 'cast',
            actorId: actor.id,
            abilityId: 'pray',
            phase: 'completed',
            ...prayerTarget(cast.intent),
        },
        ...completePrayer(
            actor,
            cast.intent,
            { ...context, now },
            roll,
            outcome.quality,
            cast.receiptId
        ),
    ]
}

function prayerTarget(intent: PrayerIntent) {
    return intent.mode === 'purify_grave'
        ? { target: intent.target }
        : intent.targetId === undefined
          ? {}
          : { targetId: intent.targetId }
}

function startRevivalPrayer(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext
): GameEventPayload[] {
    const target = context.characters.find(
        (candidate) => candidate.id === intent.targetId
    )
    if (
        target === undefined ||
        !beginRevive(actor, target, context.now, context)
    ) {
        return abilityNotice(actor, 'Воскрешение сейчас невозможно.')
    }
    return [
        {
            kind: 'cast',
            actorId: actor.id,
            targetId: target.id,
            abilityId: 'pray',
            statusId: 'reviving',
            phase: 'started',
            expiresAt:
                actor.abilities.casting?.completesAt ??
                context.now +
                    prayerParameters(actor, context.navigation.grid.tileWidth)
                        .durationMs,
        },
    ]
}

function prayerInterrupted(
    actor: GameCharacter,
    cast: Extract<PrayerCast, { mode: 'prayer' | 'purify_grave' }>,
    now: number
): boolean {
    return (
        !actor.alive ||
        actor.tags.has('offline') ||
        actor.tags.has('state.retired') ||
        actor.stunUntil > now ||
        cast.patron !== actor.progression.patron ||
        actor.locationId !== cast.locationId ||
        actor.hp < cast.hpAtStart ||
        channelMoved(actor, cast)
    )
}

function channelMoved(
    actor: GameCharacter,
    cast: Extract<PrayerCast, { mode: 'prayer' | 'purify_grave' }>
): boolean {
    const input = actor.getMoveInput()
    return (
        input.x !== 0 ||
        input.y !== 0 ||
        actor.hasPath() ||
        actor.position.x !== cast.origin.x ||
        actor.position.y !== cast.origin.y
    )
}
