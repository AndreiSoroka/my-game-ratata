import {
    ABILITY_DEFINITIONS,
    ASH_RITE_RULES,
    type AshRiteMessage,
    type GameEventPayload,
    MASTERY_XP_SCALE,
    SKELETON_ORDER_LABELS,
    type SkeletonOrder,
} from '@my-game-ratata/contracts'

import { type AbilityContext, abilityNotice } from './abilityContext'
import {
    allowAshSummonWandering,
    applyAshGift,
    ashActorAvailable,
    ashSkeletonOrder,
    ashSummoner,
    hasAshGift,
    setAshSkeletonOrder,
} from './ashSkeletonState'
import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'
import { canObserveRoomCharacter } from './characterSight'
import { canTargetByFaction } from './factions'
import { distance } from './math'
import { transferMasteryExperience } from './skillProgression'

export class AshOrders {
    private readonly ordered = new Set<GameCharacter>()

    public constructor(
        private readonly characters: ReadonlyMap<string, GameCharacter>
    ) {}

    public advance(): void {
        for (const skeleton of this.ordered) {
            this.validateOrder(skeleton)
        }
    }

    public order(
        actor: GameCharacter,
        message: Extract<AshRiteMessage, { abilityId: 'ash_order' }>,
        context: AbilityContext
    ): GameEventPayload[] {
        const target = alliedSkeleton(
            actor,
            message.targetId,
            context,
            ABILITY_DEFINITIONS.ash_order.range
        )
        if (target === undefined) {
            return abilityNotice(
                actor,
                'Приказать можно только доступному союзному скелету.'
            )
        }
        const current = ashSkeletonOrder(target)
        if (sameOrder(actor, target, message.order)) {
            return []
        }
        if (message.order === 'wander') {
            if (
                current?.ownerId !== actor.id &&
                ashSummoner(target) !== actor.id
            ) {
                return []
            }
            this.clear(target)
            allowAshSummonWandering(target)
        } else {
            if (
                current === undefined &&
                [...this.ordered].filter(
                    (skeleton) =>
                        ashSkeletonOrder(skeleton)?.ownerId === actor.id
                ).length >= ASH_RITE_RULES.orderSlots
            ) {
                return abilityNotice(actor, 'Уже подчинены три скелета.')
            }
            setAshSkeletonOrder(target, {
                ownerId: actor.id,
                ownerFaction: actor.faction,
                ownerAshPact: actor.ashPact,
                kind: message.order,
                locationId: target.locationId,
                anchor: { ...target.position },
            })
            this.ordered.add(target)
        }
        cancelCharacterControl(target)
        target.clearPath()
        target.clearPendingAttackHit()
        return [
            {
                kind: 'chat',
                actorId: actor.id,
                channel: 'say',
                text: `${SKELETON_ORDER_LABELS[message.order]}, ${target.nickname}.`,
            },
        ]
    }

    public gift(
        actor: GameCharacter,
        targetId: string,
        deep: boolean,
        context: AbilityContext
    ): GameEventPayload[] {
        const abilityId = deep ? 'ash_sacrifice' : 'ash_gift'
        const target = alliedSkeleton(
            actor,
            targetId,
            context,
            ABILITY_DEFINITIONS[abilityId].range
        )
        if (target === undefined || hasAshGift(target)) {
            return abilityNotice(
                actor,
                'Дар можно передать союзному скелету один раз.'
            )
        }
        const xp = deep ? ASH_RITE_RULES.sacrificeXp : ASH_RITE_RULES.giftXp
        const events = transferMasteryExperience(
            actor,
            target,
            'prayer_grave',
            'life',
            BigInt(xp) * MASTERY_XP_SCALE,
            deep,
            context.now
        )
        if (events === undefined) {
            return abilityNotice(actor, 'Для дара не хватает опыта Праха.')
        }
        applyAshGift(
            target,
            deep ? ASH_RITE_RULES.sacrificeHpBonus : ASH_RITE_RULES.giftHpBonus
        )
        return [
            {
                kind: 'cast',
                phase: 'completed',
                actorId: actor.id,
                targetId,
                abilityId,
            },
            ...events,
        ]
    }

    private validateOrder(skeleton: GameCharacter): void {
        const order = ashSkeletonOrder(skeleton)
        const owner =
            order === undefined ? undefined : this.characters.get(order.ownerId)
        if (
            order === undefined ||
            owner === undefined ||
            this.characters.get(skeleton.id) !== skeleton ||
            !ashActorAvailable(skeleton) ||
            skeleton.locationId !== order.locationId ||
            (order.kind !== 'guard' &&
                (!ashActorAvailable(owner) ||
                    owner.locationId !== skeleton.locationId))
        ) {
            this.clear(skeleton)
        }
    }

    public clear(actor: GameCharacter): void {
        setAshSkeletonOrder(actor, undefined)
        this.ordered.delete(actor)
    }
}

function alliedSkeleton(
    actor: GameCharacter,
    targetId: string,
    context: AbilityContext,
    range: number
): GameCharacter | undefined {
    const target = context.characters.find(
        (candidate) => candidate.id === targetId
    )
    if (
        target === undefined ||
        !availableSkeleton(actor, target) ||
        distance(actor.position, target.position) > range ||
        !canObserveRoomCharacter(
            actor,
            target,
            context.navigation,
            context.now
        ) ||
        !context.navigation.hasLineOfSight(actor.position, target.position) ||
        canTargetByFaction(actor, target, context.now) ||
        canTargetByFaction(target, actor, context.now)
    ) {
        return undefined
    }
    const ownerId = ashSummoner(target) ?? ashSkeletonOrder(target)?.ownerId
    return ownerId === undefined || ownerId === actor.id ? target : undefined
}

function availableSkeleton(
    actor: GameCharacter,
    target: GameCharacter
): boolean {
    return (
        target !== actor &&
        target.archetype === 'skeleton' &&
        target.controllerKind === 'mob1' &&
        target.soul.controlSource === 'script' &&
        target.trainingTarget === undefined &&
        ashActorAvailable(target) &&
        target.locationId === actor.locationId
    )
}

function sameOrder(
    actor: GameCharacter,
    target: GameCharacter,
    order: SkeletonOrder
): boolean {
    const current = ashSkeletonOrder(target)
    return (
        current?.ownerId === actor.id &&
        current.kind === order &&
        (order !== 'guard' || distance(current.anchor, target.position) < 16)
    )
}
