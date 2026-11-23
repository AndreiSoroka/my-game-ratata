import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { knowsAbility, type PrayerCast } from './abilityState'
import type { GameCharacter } from './character'
import { canObserveRoomCharacter } from './characterSight'
import { prayerAuraEffects } from './prayerAuras'
import { cancelPrayerCast } from './prayerCancellation'
import { validPrayerIntent } from './prayerContext'
export type ActivePrayerCast = Extract<
    PrayerCast,
    { mode: 'prayer' | 'purify_grave' }
>

export function prayerChannelValid(
    actor: GameCharacter,
    cast: ActivePrayerCast,
    context: AbilityContext
): boolean {
    return (
        !prayerInterrupted(actor, cast, context.now) &&
        channelTargetAvailable(actor, cast, context)
    )
}

/** Validate after movement and before impacts, without completing the channel. */
export function validatePrayerChannel(
    actor: GameCharacter,
    now: number,
    context: AbilityContext
): GameEventPayload[] {
    const cast = actor.abilities.casting
    if (cast?.mode !== 'prayer' && cast?.mode !== 'purify_grave') {
        return []
    }
    return prayerChannelValid(actor, cast, { ...context, now })
        ? []
        : cancelPrayerCast(actor, now)
}

function prayerInterrupted(
    actor: GameCharacter,
    cast: ActivePrayerCast,
    now: number
): boolean {
    if (!actor.alive || actor.tags.has('state.retired')) {
        return true
    }
    if (cast.mother?.lastLight === true) {
        return false
    }
    return (
        !knowsAbility(actor, cast.abilityId) ||
        actor.tags.has('offline') ||
        actor.stunUntil > now ||
        actor.locationId !== cast.locationId ||
        (cast.walkWhileCasting === true
            ? prayerAuraEffects(actor, now).feared
            : channelMoved(actor, cast))
    )
}

function channelTargetAvailable(
    actor: GameCharacter,
    cast: ActivePrayerCast,
    context: AbilityContext
): boolean {
    if (channelNeedsNoTarget(cast)) {
        return true
    }
    if (cast.plan === undefined) {
        return validPrayerIntent(actor, cast.intent, context, cast.abilityId)
    }
    const primary = cast.plan.targets[0]
    if (primary === undefined) {
        return false
    }
    if (primary.kind === 'purify_grave') {
        return (
            context.graves?.get(primary.id)?.phase !== 'purified' &&
            validPrayerIntent(actor, cast.intent, context, cast.abilityId)
        )
    }
    return plannedCharacterAvailable(actor, cast, primary, context)
}

function plannedCharacterAvailable(
    actor: GameCharacter,
    cast: ActivePrayerCast,
    primary: { id: string; kind: string },
    context: AbilityContext
): boolean {
    const target =
        primary.id === actor.id
            ? actor
            : context.characters.find(
                  (candidate) => candidate.id === primary.id
              )
    if (
        target !== undefined &&
        !pinnedTargetVisible(actor, cast, target, context)
    ) {
        return false
    }
    return (
        target !== undefined &&
        recipientRemainsValid(target, cast, primary.kind, context.now) &&
        recipientInRange(actor, target, cast.plan?.radius ?? 0, context)
    )
}

function pinnedTargetVisible(
    actor: GameCharacter,
    cast: ActivePrayerCast,
    target: GameCharacter,
    context: AbilityContext
): boolean {
    return (
        cast.intent.targetId === undefined ||
        canObserveRoomCharacter(actor, target, context.navigation, context.now)
    )
}

function recipientRemainsValid(
    target: GameCharacter,
    cast: ActivePrayerCast,
    kind: string,
    now: number
): boolean {
    if (
        target.locationId !== cast.locationId ||
        target.tags.has('offline') ||
        target.tags.has('state.retired')
    ) {
        return false
    }
    if (kind === 'revive') {
        return !target.alive && target.reviveUntil > now
    }
    if (!target.alive) {
        return false
    }
    const domainCanHeal =
        cast.mother?.domain === true && cast.mother.aurasEnabled
    return kind !== 'restore' || target.hp < target.maxHp || domainCanHeal
}

function recipientInRange(
    actor: GameCharacter,
    target: GameCharacter,
    radius: number,
    context: AbilityContext
): boolean {
    return (
        Math.hypot(
            target.position.x - actor.position.x,
            target.position.y - actor.position.y
        ) <= radius &&
        (target === actor ||
            context.navigation.hasLineOfSight(actor.position, target.position))
    )
}

function channelMoved(actor: GameCharacter, cast: ActivePrayerCast): boolean {
    const input = actor.getMoveInput()
    return (
        input.x !== 0 ||
        input.y !== 0 ||
        actor.hasPath() ||
        actor.position.x !== cast.origin.x ||
        actor.position.y !== cast.origin.y
    )
}

function channelNeedsNoTarget(cast: ActivePrayerCast): boolean {
    return cast.mother?.lastLight === true || cast.plan?.auraOnly === true
}
