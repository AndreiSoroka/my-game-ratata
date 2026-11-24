import {
    ABILITY_DEFINITIONS,
    ASH_RULES,
    type CharacterAbilitiesSnapshot,
    type GameEventPayload,
    type Vector2,
} from '@my-game-ratata/contracts'

import { type AbilityContext, abilityNotice } from './abilityContext'
import { ashExhaustionHostile } from './ashExhaustion'
import { ashActorAvailable } from './ashSkeletonState'
import type { GameCharacter } from './character'
import { hasCharacterRoute } from './characterRoute'
import { canObserveRoomCharacter } from './characterSight'
import { availableToAttack, availableToStartAttack } from './combat'
import { startCombatAction } from './combatActions'
import { allowsSharedCombat } from './combatPermission'
import { ashParameters } from './constellationModifiers'
import { ensureMagicCombat } from './magicCombat'
import { distance, facingDirection, normalize } from './math'
import { recordResourceSpend } from './resourcePractice'
import { captureMasteryFactors } from './skillProgression'

const abilityId = 'ash_exhaustion'
const definition = ABILITY_DEFINITIONS[abilityId]

interface ExhaustionCast {
    target: GameCharacter
    targetDeathSequence: number
    locationId: string
    position: Vector2
    startedAt: number
    completesAt: number
    damaged: boolean
    random: () => number
}

const casts = new WeakMap<GameCharacter, ExhaustionCast>()

export function ashExhaustionCasting(actor: GameCharacter): boolean {
    return casts.has(actor)
}

export function snapshotAshExhaustionCast(
    actor: GameCharacter,
    now: number
): CharacterAbilitiesSnapshot['ashCasting'] {
    const cast = casts.get(actor)
    return cast === undefined ||
        cast.damaged ||
        !actor.alive ||
        cast.completesAt <= now
        ? undefined
        : {
              abilityId,
              targetId: cast.target.id,
              startedAt: cast.startedAt,
              completesAt: cast.completesAt,
          }
}

export function markAshExhaustionCastDamaged(actor: GameCharacter): void {
    const cast = casts.get(actor)
    if (cast !== undefined) {
        cast.damaged = true
    }
}

export function cancelAshExhaustionCast(
    actor: GameCharacter,
    now: number
): GameEventPayload[] {
    const cast = casts.get(actor)
    if (cast === undefined) {
        return []
    }
    casts.delete(actor)
    if (actor.actionLockUntil <= cast.completesAt) {
        actor.actionLockUntil = now
    }
    if (actor.alive && actor.animationAction === 'attack') {
        actor.animationUntil = now
        actor.setAnimation('idle', now)
    }
    return [castEvent(actor, cast, 'interrupted')]
}

export function ashExhaustionTarget(
    actor: GameCharacter,
    targetId: string,
    context: AbilityContext
): GameCharacter | undefined {
    const { characters, now } = context
    if (
        !actor.abilities.known.has(abilityId) ||
        ashParameters(actor).exhaustionRank === 0 ||
        actor.mana < definition.mana ||
        (actor.abilities.availableAt[abilityId] ?? 0) > now
    ) {
        return undefined
    }
    const target = characters.find((character) => character.id === targetId)
    return target !== undefined && validTarget(actor, target, context)
        ? target
        : undefined
}

function validTarget(
    actor: GameCharacter,
    target: GameCharacter,
    context: AbilityContext
): boolean {
    const { navigation, now } = context
    return (
        target.alive &&
        !target.tags.has('offline') &&
        !target.tags.has('state.retired') &&
        target.locationId === actor.locationId &&
        ashExhaustionHostile(actor, target, now, context.sameParty) &&
        distance(actor.position, target.position) <= exhaustionRange(context) &&
        canObserveRoomCharacter(actor, target, navigation, now) &&
        navigation.hasLineOfSight(actor.position, target.position)
    )
}

function exhaustionRange({ navigation }: AbilityContext): number {
    return ASH_RULES.exhaustion.rangeCells * navigation.grid.tileWidth
}

export class AshExhaustionCasts {
    private readonly casting = new Set<GameCharacter>()

    public begin(
        actor: GameCharacter,
        targetId: string,
        context: AbilityContext
    ): GameEventPayload[] {
        const { now } = context
        const target = ashExhaustionTarget(actor, targetId, context)
        if (
            casts.has(actor) ||
            !ashActorAvailable(actor) ||
            !allowsSharedCombat(actor) ||
            !availableToStartAttack(actor, now) ||
            actor.movement.dashUntil > now ||
            target === undefined
        ) {
            return abilityNotice(
                actor,
                'Для Тленного сгустка нужна доступная враждебная цель и мана.'
            )
        }
        const { windupMs } = definition
        const cast: ExhaustionCast = {
            target,
            targetDeathSequence: target.deathSequence,
            locationId: actor.locationId,
            position: { ...actor.position },
            startedAt: now,
            completesAt: now + windupMs,
            damaged: false,
            random: context.random ?? Math.random,
        }
        casts.set(actor, cast)
        this.casting.add(actor)
        actor.clearPath()
        actor.setMoveInput({ x: 0, y: 0 })
        actor.lockAction(now, windupMs)
        actor.setAnimation('attack', now, windupMs)
        return [{ ...castEvent(actor, cast, 'started'), durationMs: windupMs }]
    }

    public advance(
        contextFor: (actor: GameCharacter) => AbilityContext
    ): GameEventPayload[] {
        const events: GameEventPayload[] = []
        for (const actor of this.casting) {
            const cast = casts.get(actor)
            if (cast === undefined) {
                this.casting.delete(actor)
                continue
            }
            const context = contextFor(actor)
            const { now } = context
            if (!canContinue(actor, cast, context)) {
                this.casting.delete(actor)
                events.push(...cancelAshExhaustionCast(actor, now))
            } else if (now >= cast.completesAt) {
                this.casting.delete(actor)
                casts.delete(actor)
                events.push(...release(actor, cast, context))
            }
        }
        return events
    }
}

function canContinue(
    actor: GameCharacter,
    cast: ExhaustionCast,
    context: AbilityContext
): boolean {
    return (
        !cast.damaged &&
        ashActorAvailable(actor) &&
        allowsSharedCombat(actor) &&
        availableToAttack(actor, context.now) &&
        context.characters.includes(actor) &&
        cast.locationId === actor.locationId &&
        stationaryCaster(actor, cast.position) &&
        cast.target.deathSequence === cast.targetDeathSequence &&
        ashExhaustionTarget(actor, cast.target.id, context) === cast.target
    )
}

function stationaryCaster(actor: GameCharacter, position: Vector2): boolean {
    const input = actor.getMoveInput()
    return (
        distance(actor.position, position) <= 1e-8 &&
        input.x === 0 &&
        input.y === 0 &&
        !actor.hasPath() &&
        !hasCharacterRoute(actor)
    )
}

function release(
    actor: GameCharacter,
    cast: ExhaustionCast,
    context: AbilityContext
): GameEventPayload[] {
    const rank = ashParameters(actor).exhaustionRank
    if (rank === 0) {
        return []
    }
    const { now, navigation } = context
    const { position, target } = cast
    const range = exhaustionRange(context)
    const direction =
        distance(position, target.position) > 1e-8
            ? normalize({
                  x: target.position.x - position.x,
                  y: target.position.y - position.y,
              })
            : facingDirection(actor.facing)
    const radius = navigation.grid.tileWidth / 3
    actor.updateFacing(direction)
    actor.mana -= definition.mana
    actor.abilities.availableAt[abilityId] = now + definition.cooldownMs
    const launched = startCombatAction(
        actor,
        now,
        {
            targetId: target.id,
            abilityId,
            delivery: 'magic',
            canStun: false,
            damageMultiplier: 1,
            targetEnergyDrain: 0,
        },
        { cycleMs: 0, windupMs: 0, movementMs: 0, animationMs: 250 },
        { kind: 'circle', center: position, radius: 0 },
        'immediate'
    )
    ensureMagicCombat(actor, context).launch({
        id: launched.actionId,
        actor,
        abilityId,
        launchedAt: now,
        launched: true,
        locationId: cast.locationId,
        position,
        direction,
        range,
        traveled: 0,
        radius,
        speed: ASH_RULES.exhaustion.speed,
        rank,
        resourceSpend: recordResourceSpend(actor, 'mana', definition.mana),
        factors: captureMasteryFactors(actor),
        random: cast.random,
    })
    context.onProjectileRelease?.(actor, position)
    return [
        castEvent(actor, cast, 'completed'),
        { ...launched, damageKind: 'unholy', locationId: cast.locationId },
    ]
}

function castEvent(
    actor: GameCharacter,
    cast: ExhaustionCast,
    phase: 'started' | 'completed' | 'interrupted'
): GameEventPayload {
    return {
        kind: 'cast',
        actorId: actor.id,
        targetId: cast.target.id,
        locationId: cast.locationId,
        abilityId,
        phase,
    }
}
