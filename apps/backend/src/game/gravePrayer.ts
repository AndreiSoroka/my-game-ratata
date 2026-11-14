import {
    ABILITY_DEFINITIONS,
    type GameEventPayload,
    GRAVE_PURIFY_MANA_COST,
    GRAVE_PURIFY_RANGE,
    graveBounds,
    gravePurifyCastMs,
    interactionApproachPoints,
} from '@my-game-ratata/contracts'

import { type AbilityContext, abilityNotice } from './abilityContext'
import { knowsAbility, type PrayerCast } from './abilityState'
import type { GameCharacter } from './character'
import { distance } from './math'
import { cancelPrayerCast, releasePrayerCast } from './prayerCancellation'
import { canPerformSkillAction, trainSkill } from './skillProgression'

type PurificationCast = Extract<PrayerCast, { mode: 'purify_grave' }>

export function canPurifyGrave(
    actor: GameCharacter,
    graveId: string,
    context: AbilityContext
): boolean {
    return validPurificationTarget(actor, graveId, context, GRAVE_PURIFY_RANGE)
}

/** Automatic intentions may approach a visible grave before starting its channel. */
export function canApproachGravePurification(
    actor: GameCharacter,
    graveId: string,
    context: AbilityContext
): boolean {
    return validPurificationTarget(actor, graveId, context, 240)
}

function validPurificationTarget(
    actor: GameCharacter,
    graveId: string,
    context: AbilityContext,
    range: number
): boolean {
    const grave = context.graves?.get(graveId)
    if (
        !knowsAbility(actor, 'pray') ||
        !(
            actor.heroClass === 'cleric' ||
            actor.progression.skills.miracles.level >= 5
        ) ||
        grave === undefined ||
        grave.phase === 'purified' ||
        grave.locationId !== actor.locationId ||
        distance(actor.position, grave.position) > range
    ) {
        return false
    }
    const bounds = graveBounds(grave.position)
    return interactionApproachPoints(actor.position, [bounds]).some(
        (point) =>
            !context.navigation.isSolidTile(
                context.navigation.worldToTile(point)
            ) && context.navigation.hasLineOfSight(actor.position, point)
    )
}

export function beginGravePurification(
    actor: GameCharacter,
    graveId: string,
    context: AbilityContext
): GameEventPayload[] {
    const now = context.now
    const grave = context.graves?.get(graveId)
    if (
        grave === undefined ||
        actor.abilities.casting !== null ||
        !canPerformSkillAction(actor, now) ||
        !canPurifyGrave(actor, graveId, context) ||
        actor.mana < GRAVE_PURIFY_MANA_COST ||
        now < actor.progression.prayerAvailableAt ||
        now < (actor.abilities.availableAt.pray ?? 0)
    ) {
        return abilityNotice(actor, 'Могилу сейчас нельзя освятить.')
    }
    const duration = gravePurifyCastMs(grave.phase)
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
    actor.abilities.casting = {
        mode: 'purify_grave',
        targetId: graveId,
        startedAt: now,
        completesAt: now + duration,
        patron: actor.progression.patron,
        origin: { ...actor.position },
        locationId: actor.locationId,
        hpAtStart: actor.hp,
    }
    actor.lockAction(now, duration)
    actor.setAnimation('attack', now, duration)
    return [
        {
            kind: 'cast',
            actorId: actor.id,
            abilityId: 'pray',
            phase: 'started',
            target: { kind: 'grave', id: graveId },
            expiresAt: now + duration,
            durationMs: duration,
        },
    ]
}

export function advanceGravePurification(
    actor: GameCharacter,
    now: number,
    context?: AbilityContext
): GameEventPayload[] {
    const cast = actor.abilities.casting
    if (cast?.mode !== 'purify_grave') {
        return []
    }
    if (
        context === undefined ||
        interrupted(actor, cast, now) ||
        !canPurifyGrave(actor, cast.targetId, context)
    ) {
        return cancelPrayerCast(actor, now)
    }
    if (now < cast.completesAt) {
        return []
    }
    if (
        actor.mana < GRAVE_PURIFY_MANA_COST ||
        context.graves?.purify(cast.targetId, now) !== true
    ) {
        return cancelPrayerCast(actor, now)
    }
    releasePrayerCast(actor, now)
    actor.mana -= GRAVE_PURIFY_MANA_COST
    actor.progression.prayerAvailableAt =
        now + ABILITY_DEFINITIONS.pray.cooldownMs
    actor.abilities.availableAt.pray = actor.progression.prayerAvailableAt
    const target = { kind: 'grave' as const, id: cast.targetId }
    return [
        {
            kind: 'cast',
            actorId: actor.id,
            abilityId: 'pray',
            phase: 'completed',
            target,
        },
        { kind: 'grave_purified', actorId: actor.id, target },
        ...trainSkill(actor, 'faith'),
        ...trainSkill(actor, 'miracles'),
    ]
}

function interrupted(
    actor: GameCharacter,
    cast: PurificationCast,
    now: number
): boolean {
    return (
        !actor.alive ||
        actor.tags.has('offline') ||
        actor.tags.has('state.retired') ||
        actor.stunUntil > now ||
        actor.locationId !== cast.locationId ||
        actor.hp < cast.hpAtStart ||
        channelMovement(actor, cast)
    )
}

function channelMovement(
    actor: GameCharacter,
    cast: PurificationCast
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
