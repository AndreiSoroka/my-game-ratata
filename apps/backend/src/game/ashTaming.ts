import {
    ABILITY_DEFINITIONS,
    ASH_RITE_RULES,
    type GameEventPayload,
} from '@my-game-ratata/contracts'

import { type AbilityContext, abilityNotice } from './abilityContext'
import {
    ashActorAvailable,
    ashBoundSkeletons,
    ashSkeletonBond,
    ashSkeletonOrder,
    ashSummoner,
    bindAshSkeleton,
} from './ashSkeletonState'
import type { GameCharacter } from './character'
import { canObserveRoomCharacter } from './characterSight'
import { distance } from './math'
import { confirmResourceSpend, recordResourceSpend } from './resourcePractice'
import type { WorldLocations } from './worldLocations'

interface TamingCast {
    abilityId: 'ash_tame'
    target: GameCharacter
    targetDeathSequence: number
    startedAt: number
    completesAt: number
    locationId: string
    cancelled: boolean
}

const active = new WeakMap<GameCharacter, TamingCast>()

export function ashTamingInProgress(actor: GameCharacter): boolean {
    return active.has(actor)
}

export function cancelAshTame(actor: GameCharacter): void {
    const cast = active.get(actor)
    if (cast !== undefined) {
        cast.cancelled = true
    }
}

export function snapshotAshTaming(actor: GameCharacter, now: number) {
    const cast = active.get(actor)
    return cast !== undefined && !cast.cancelled && cast.completesAt > now
        ? {
              abilityId: cast.abilityId,
              targetId: cast.target.id,
              startedAt: cast.startedAt,
              completesAt: cast.completesAt,
          }
        : undefined
}

export function isTameableAshSkeleton(
    actor: GameCharacter,
    target: GameCharacter
): boolean {
    const order = ashSkeletonOrder(target)
    return (
        actor !== target &&
        actor.abilities.known.has('ash_tame') &&
        availableWildSkeleton(target) &&
        target.locationId === actor.locationId &&
        (order === undefined || order.ownerId === actor.id)
    )
}

function availableWildSkeleton(target: GameCharacter): boolean {
    return (
        ashActorAvailable(target) &&
        target.archetype === 'skeleton' &&
        target.creatureType === 'undead' &&
        target.controllerKind === 'mob1' &&
        target.soul.controlSource === 'script' &&
        target.soul.companion?.leaderId == null &&
        target.trainingTarget === undefined &&
        ashSkeletonBond(target) === undefined &&
        ashSummoner(target) === undefined
    )
}

export function canTameAshSkeleton(
    actor: GameCharacter,
    target: GameCharacter,
    context: Pick<AbilityContext, 'navigation' | 'now'>
): boolean {
    const definition = ABILITY_DEFINITIONS.ash_tame
    return (
        ashActorAvailable(actor) &&
        isTameableAshSkeleton(actor, target) &&
        ashBoundSkeletons(actor).length < ASH_RITE_RULES.orderSlots &&
        actor.mana >= definition.mana &&
        distance(actor.position, target.position) <= definition.range &&
        canObserveRoomCharacter(
            actor,
            target,
            context.navigation,
            context.now
        ) &&
        context.navigation.hasLineOfSight(actor.position, target.position)
    )
}

export class AshTaming {
    private readonly casters = new Set<GameCharacter>()

    public constructor(
        private readonly world: () => WorldLocations,
        private readonly characters: ReadonlyMap<string, GameCharacter>
    ) {}

    public begin(
        actor: GameCharacter,
        targetId: string,
        context: AbilityContext
    ): GameEventPayload[] {
        const target = this.characters.get(targetId)
        if (
            active.has(actor) ||
            target === undefined ||
            !canTameAshSkeleton(actor, target, context)
        ) {
            return abilityNotice(
                actor,
                'Для приручения нужен доступный скелет, свободное место и мана.'
            )
        }
        const durationMs = ABILITY_DEFINITIONS.ash_tame.windupMs
        const cast: TamingCast = {
            abilityId: 'ash_tame',
            target,
            targetDeathSequence: target.deathSequence,
            startedAt: context.now,
            completesAt: context.now + durationMs,
            locationId: actor.locationId,
            cancelled: false,
        }
        active.set(actor, cast)
        this.casters.add(actor)
        actor.clearPath()
        actor.setMoveInput({ x: 0, y: 0 })
        actor.lockAction(context.now, durationMs)
        actor.setAnimation('attack', context.now, durationMs)
        return [{ ...tamingEvent(actor, target, 'started'), durationMs }]
    }

    public advance(now: number): GameEventPayload[] {
        return [...this.casters].flatMap((actor) => this.resolve(actor, now))
    }

    private resolve(actor: GameCharacter, now: number): GameEventPayload[] {
        const cast = active.get(actor)
        if (cast === undefined) {
            return []
        }
        const { target } = cast
        const valid = this.canContinue(actor, cast, now)
        if (valid && now < cast.completesAt) {
            return []
        }
        active.delete(actor)
        this.casters.delete(actor)
        if (!valid) {
            if (actor.actionLockUntil <= cast.completesAt) {
                actor.actionLockUntil = now
            }
            if (actor.alive && actor.animationAction === 'attack') {
                actor.animationUntil = now
                actor.setAnimation('idle', now)
            }
            return [tamingEvent(actor, target, 'interrupted')]
        }
        const { mana, cooldownMs } = ABILITY_DEFINITIONS.ash_tame
        bindAshSkeleton(target, actor)
        actor.mana -= mana
        confirmResourceSpend(recordResourceSpend(actor, 'mana', mana))
        actor.abilities.availableAt.ash_tame = now + cooldownMs
        return [tamingEvent(actor, target, 'completed')]
    }

    private canContinue(
        actor: GameCharacter,
        cast: TamingCast,
        now: number
    ): boolean {
        return (
            !cast.cancelled &&
            actor.locationId === cast.locationId &&
            this.characters.get(actor.id) === actor &&
            this.characters.get(cast.target.id) === cast.target &&
            cast.target.deathSequence === cast.targetDeathSequence &&
            actor.stunUntil <= now &&
            canTameAshSkeleton(actor, cast.target, {
                navigation: this.world().get(cast.locationId).navigation,
                now,
            })
        )
    }
}

function tamingEvent(
    actor: GameCharacter,
    target: GameCharacter,
    phase: 'started' | 'completed' | 'interrupted'
): GameEventPayload {
    return {
        kind: 'cast',
        abilityId: 'ash_tame',
        actorId: actor.id,
        targetId: target.id,
        phase,
    }
}
