import {
    type ArrowAbilityId,
    type AttackGeometry,
    forwardShot,
    type GameEventPayload,
    QUICK_SHOT_RULES,
    SHOT_HALF_WIDTH,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { ArrowAttack, PendingAttackHit } from './characterState'
import { type AttackContext, isLegalAttackTarget } from './combat'
import { forwardAttackZones } from './combatGeometry'
import { constellationModifiers } from './constellationModifiers'
import { distance, zeroVector } from './math'
import { visibilityRadius } from './queries'

export function canAimSniperAt(
    context: AttackContext,
    target: GameCharacter,
    origin = context.actor.position
): boolean {
    const { actor, now } = context
    return (
        isLegalAttackTarget(actor, target, context, origin) &&
        distance(origin, target.position) <=
            visibilityRadius(actor, target, 240, now, origin)
    )
}

export function startArrowAttack(
    context: AttackContext,
    abilityId: ArrowAbilityId,
    range: number,
    mobile: boolean,
    selected: GameCharacter | undefined
): ArrowAttack {
    const { actor, now } = context
    const origin = { ...actor.position }
    const aim =
        selected === undefined
            ? forwardShot(origin, actor.facing, range).endpoint
            : { ...selected.position }
    const modifiers = constellationModifiers(actor)
    const lastPaidAttackAt = Math.max(
        actor.lastAttackAt,
        actor.combat.lastCounterAttackAt ?? -Infinity
    )
    const previousHit = actor.combat.lastUsefulArrowHit
    delete actor.combat.lastUsefulArrowHit
    if (abilityId === 'sniper_shot') {
        actor.clearPath()
        actor.setMoveInput(zeroVector())
    }
    if (!mobile) {
        actor.velocity = zeroVector()
    }
    return {
        abilityId,
        origin,
        aim,
        facing: actor.facing,
        range,
        mobile,
        moved: false,
        openerDamage:
            abilityId === 'sniper_shot' && now - lastPaidAttackAt >= 5000
                ? modifiers.sniperOpeningDamage
                : 0,
        previousHit,
    }
}

export function arrowAttackGeometry(
    actor: GameCharacter,
    arrow: ArrowAttack
): AttackGeometry {
    if (arrow.abilityId === 'sniper_shot') {
        return sniperAttackGeometry(arrow.origin, arrow.range)
    }
    return {
        kind: 'rectangles',
        zones: forwardAttackZones(
            { id: actor.id, position: actor.position, facing: arrow.facing },
            arrow.range,
            SHOT_HALF_WIDTH
        ),
    }
}

export function sniperAttackGeometry(
    center: Vector2,
    radius: number
): AttackGeometry {
    return { kind: 'circle', center: { ...center }, radius }
}

export function arrowPhaseEvent(
    actor: GameCharacter,
    attack: PendingAttackHit,
    phase: 'completed' | 'interrupted'
): GameEventPayload {
    return {
        kind: 'attack',
        phase,
        actorId: actor.id,
        delivery: 'ranged_physical',
        attackOrigin: 'ability',
        ...(attack.abilityId === undefined
            ? {}
            : { abilityId: attack.abilityId }),
        ...(attack.actionId === undefined ? {} : { actionId: attack.actionId }),
    }
}

export function cancelSniperAimForMovement(
    actor: GameCharacter,
    axis: Vector2,
    now: number
): GameEventPayload[] {
    return axis.x === 0 && axis.y === 0 ? [] : cancelSniperAim(actor, now)
}

export function interruptSniperOnMove(
    actor: GameCharacter,
    now: number,
    onEvents: ((events: GameEventPayload[]) => void) | undefined
): void {
    if (actor.pendingAttack?.abilityId !== 'sniper_shot') {
        return
    }
    const events = actor.hasPath()
        ? cancelSniperAim(actor, now)
        : cancelSniperAimForMovement(actor, actor.getMoveInput(), now)
    if (events.length > 0) {
        onEvents?.(events)
    }
}

export function cancelSniperAim(
    actor: GameCharacter,
    now: number
): GameEventPayload[] {
    const attack = actor.pendingAttack
    if (attack?.abilityId !== 'sniper_shot' || now >= attack.hitAt) {
        return []
    }
    actor.clearPendingAttackHit()
    delete actor.combat.action
    actor.actionLockUntil = now
    actor.animationUntil = now
    actor.setAnimation('idle', now)
    return [arrowPhaseEvent(actor, attack, 'interrupted')]
}

export function markArrowWalking(actor: GameCharacter, walking: boolean): void {
    const arrow = actor.pendingAttack?.arrow
    if (walking && arrow?.mobile === true) {
        arrow.moved = true
    }
}

export function quickShotBlocksMovement(actor: GameCharacter): boolean {
    // Movement runs before hit resolution, even on a tick past the aim deadline.
    const arrow = actor.pendingAttack?.arrow
    return (
        arrow?.abilityId === 'shot' &&
        (!arrow.mobile || actor.movement.mode !== 'walking')
    )
}

export function holdQuickShotDuringSneak(
    actor: GameCharacter,
    now: number
): void {
    const action = actor.combat.action
    if (
        action?.abilityId === 'shot' &&
        action.movementAt < action.readyAt &&
        now < action.readyAt
    ) {
        action.movementAt = action.readyAt
        actor.lockAction(now, action.readyAt - now)
    }
}

export function arrowContactDamage(
    context: AttackContext,
    attack: PendingAttackHit,
    target: { id: string; position: Vector2 }
): PendingAttackHit {
    const { arrow } = attack
    if (arrow === undefined) {
        return attack
    }
    const { actor, tileSize } = context
    const mods = constellationModifiers(actor)
    let bonus = arrow.openerDamage
    if (arrow.abilityId === 'sniper_shot') {
        if (distance(arrow.origin, target.position) >= 8 * tileSize) {
            bonus += mods.sniperLongRangeDamage
        }
    } else {
        bonus += arrow.moved ? mods.movingShotDamage : 0
        bonus += quickFollowupDamage(context, arrow, target.id, mods)
    }
    return {
        ...attack,
        damageMultiplier: attack.damageMultiplier * (1 + bonus),
    }
}

function quickFollowupDamage(
    { actor, now }: AttackContext,
    arrow: ArrowAttack,
    targetId: string,
    mods: ReturnType<typeof constellationModifiers>
): number {
    const previous = arrow.previousHit
    if (
        previous?.targetId !== targetId ||
        previous.locationId !== actor.locationId
    ) {
        return 0
    }
    const elapsed = now - previous.at
    if (previous.abilityId === 'shot') {
        return elapsed <= QUICK_SHOT_RULES.seriesWindowMs
            ? mods.shotSeriesDamage
            : 0
    }
    return arrow.moved && elapsed <= 4000 ? mods.movingShotFollowupDamage : 0
}

export function recordUsefulArrowHit(
    context: AttackContext,
    arrow: ArrowAttack,
    targetId: string
): void {
    const { actor, now } = context
    actor.combat.lastUsefulArrowHit = {
        abilityId: arrow.abilityId,
        targetId,
        locationId: actor.locationId,
        at: now,
    }
    if (!arrow.moved) {
        return
    }
    const mods = constellationModifiers(actor)
    if (mods.movingShotDashReductionMs > 0) {
        actor.movement.dashAvailableAt = Math.max(
            now,
            actor.movement.dashAvailableAt - mods.movingShotDashReductionMs
        )
    }
    if (mods.movingShotSpeedBonus > 0) {
        actor.combat.arrowStep = {
            until: now + 600,
            multiplier: 1 + mods.movingShotSpeedBonus,
        }
    }
}
