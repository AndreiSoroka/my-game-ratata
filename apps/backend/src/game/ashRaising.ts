import {
    ABILITY_DEFINITIONS,
    type GameEventPayload,
    MASTERY_REWARDS,
    type Vector2,
} from '@my-game-ratata/contracts'

import { type AbilityContext, abilityNotice } from './abilityContext'
import { ashActorAvailable as available } from './ashSkeletonState'
import type { AshSummons } from './ashSummons'
import type { GameCharacter } from './character'
import { ashParameters } from './constellationModifiers'
import { distance } from './math'
import { confirmResourceSpend, recordResourceSpend } from './resourcePractice'
import { awardMasteries } from './skillProgression'
import type { WorldLocations } from './worldLocations'

interface RaisingCast {
    targetId: string
    locationId: string
    completesAt: number
    hpAtStart: number
    cancelled: boolean
}
const activeRaises = new WeakMap<GameCharacter, RaisingCast>()

export function cancelAshRaise(actor: GameCharacter): void {
    const cast = activeRaises.get(actor)
    if (cast !== undefined) {
        cast.cancelled = true
    }
}

export class AshRaising {
    private readonly casting = new Set<GameCharacter>()

    public constructor(
        private readonly world: () => WorldLocations,
        private readonly characters: ReadonlyMap<string, GameCharacter>,
        private readonly summons: AshSummons
    ) {}

    public advance(now: number): GameEventPayload[] {
        return [...this.casting].flatMap((actor) =>
            this.advanceRaise(actor, now)
        )
    }

    public begin(
        actor: GameCharacter,
        targetId: string,
        context: AbilityContext
    ): GameEventPayload[] {
        const remains = this.raiseTarget(actor, targetId, context.now)
        if (
            activeRaises.has(actor) ||
            remains === undefined ||
            this.spawnPoint(actor, remains) === undefined
        ) {
            return abilityNotice(
                actor,
                'Для подъёма нужны доступные останки, мана и место для скелета.'
            )
        }
        const durationMs = ashParameters(actor).raiseWindupMs
        const cast = {
            targetId,
            locationId: actor.locationId,
            completesAt: context.now + durationMs,
            hpAtStart: actor.hp,
            cancelled: false,
        }
        activeRaises.set(actor, cast)
        this.casting.add(actor)
        actor.clearPath()
        actor.setMoveInput({ x: 0, y: 0 })
        actor.lockAction(context.now, durationMs)
        actor.setAnimation('attack', context.now, durationMs)
        return [raiseEvent(actor, cast, 'started', durationMs)]
    }

    private advanceRaise(
        actor: GameCharacter,
        now: number
    ): GameEventPayload[] {
        const cast = activeRaises.get(actor)
        if (cast === undefined) {
            return []
        }
        if (!this.canContinue(actor, cast, now)) {
            return this.interruptRaise(actor, cast, now)
        }
        const remains = this.raiseTarget(actor, cast.targetId, now)
        if (remains === undefined) {
            return this.interruptRaise(actor, cast, now)
        }
        if (now < cast.completesAt) {
            return []
        }
        const destination = this.spawnPoint(actor, remains)
        if (destination === undefined) {
            return this.interruptRaise(actor, cast, now)
        }
        const location = this.world().get(cast.locationId)
        this.finishCasting(actor)
        if (
            location.inventory.deathLoot.consumeRemains(cast.targetId, now) ===
            undefined
        ) {
            return [raiseEvent(actor, cast, 'interrupted')]
        }
        const definition = ABILITY_DEFINITIONS.ash_raise
        const parameters = ashParameters(actor)
        actor.mana -= definition.mana
        confirmResourceSpend(
            recordResourceSpend(actor, 'mana', definition.mana)
        )
        actor.abilities.availableAt.ash_raise = now + definition.cooldownMs
        const skeleton = this.summons.create(
            actor,
            destination,
            now,
            parameters.raiseDurationMs
        )
        skeleton.hp = Math.max(
            1,
            Math.ceil(skeleton.maxHp * parameters.raiseHpFraction)
        )
        return [
            raiseEvent(actor, cast, 'completed'),
            ...awardMasteries(
                actor,
                [
                    {
                        constellationId: 'prayer_grave',
                        experience: MASTERY_REWARDS.ashRaise,
                    },
                ],
                {
                    now,
                    receiptId: `ash-raise:${cast.locationId}:${cast.targetId}`,
                }
            ),
        ]
    }

    private raiseTarget(
        actor: GameCharacter,
        targetId: string,
        now: number
    ): Vector2 | undefined {
        if (
            actor.mana < ABILITY_DEFINITIONS.ash_raise.mana ||
            this.summons.count(actor) >= ashParameters(actor).raiseSlots
        ) {
            return undefined
        }
        const { inventory, navigation } = this.world().get(actor.locationId)
        const remains = inventory.deathLoot.raisableRemains(targetId, now)
        if (
            remains === undefined ||
            distance(actor.position, remains.position) >
                ABILITY_DEFINITIONS.ash_raise.range ||
            !navigation.hasLineOfSight(actor.position, remains.position)
        ) {
            return undefined
        }
        return remains.position
    }

    private spawnPoint(
        actor: GameCharacter,
        remains: Vector2
    ): Vector2 | undefined {
        const { navigation } = this.world().get(actor.locationId)
        const origin = navigation.worldToTile(remains)
        const occupants = [...this.characters.values()].filter(
            (target) => target.alive && target.locationId === actor.locationId
        )
        const radius = Math.ceil(32 / navigation.grid.tileWidth)
        const points: Vector2[] = []
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const tile = { x: origin.x + dx, y: origin.y + dy }
                if (!navigation.isSolidTile(tile)) {
                    points.push(navigation.tileToWorld(tile))
                }
            }
        }
        return points
            .sort((a, b) => distance(remains, a) - distance(remains, b))
            .find(
                (point) =>
                    distance(remains, point) <= 32 &&
                    navigation.hasLineOfSight(remains, point) &&
                    occupants.every(
                        (target) => distance(target.position, point) >= 16
                    )
            )
    }

    private canContinue(
        actor: GameCharacter,
        cast: RaisingCast,
        now: number
    ): boolean {
        return (
            !cast.cancelled &&
            available(actor) &&
            this.characters.get(actor.id) === actor &&
            actor.locationId === cast.locationId &&
            actor.stunUntil <= now &&
            actor.hp >= cast.hpAtStart &&
            actor.abilities.known.has('ash_raise')
        )
    }

    private interruptRaise(
        actor: GameCharacter,
        cast: RaisingCast,
        now: number
    ): GameEventPayload[] {
        if (actor.actionLockUntil <= cast.completesAt) {
            actor.actionLockUntil = now
        }
        this.finishCasting(actor)
        return [raiseEvent(actor, cast, 'interrupted')]
    }

    private finishCasting(actor: GameCharacter): void {
        activeRaises.delete(actor)
        this.casting.delete(actor)
    }
}

function raiseEvent(
    actor: GameCharacter,
    cast: RaisingCast,
    phase: 'started' | 'completed' | 'interrupted',
    durationMs?: number
): GameEventPayload {
    return {
        kind: 'cast',
        abilityId: 'ash_raise',
        actorId: actor.id,
        chestId: cast.targetId,
        phase,
        ...(durationMs === undefined ? {} : { durationMs }),
    }
}
