import type { AttackContext } from './combat'
import { isLegalAttackTarget } from './combat'
import { isInZones } from './combatGeometry'
import { legalGraveTarget } from './graveCombat'

export function prepareTarget(context: AttackContext): boolean {
    if (context.target !== undefined) {
        const grave = context.graves?.get(context.target.id)
        if (
            context.targetId !== undefined ||
            !legalGraveTarget(context.actor, grave, context.navigation)
        ) {
            return false
        }
        context.actor.updateFacing({
            x: grave.position.x - context.actor.position.x,
            y: grave.position.y - context.actor.position.y,
        })
        return true
    }
    if (context.targetId === undefined) {
        return true
    }
    const target = context.targets.find(
        (candidate) => candidate.id === context.targetId
    )
    if (
        target === undefined ||
        !isLegalAttackTarget(context.actor, target, context)
    ) {
        return false
    }
    context.actor.updateFacing({
        x: target.position.x - context.actor.position.x,
        y: target.position.y - context.actor.position.y,
    })
    return true
}
export function targetWithinZones(context: AttackContext): boolean {
    if (context.target !== undefined) {
        const grave = context.graves?.get(context.target.id)
        return (
            grave !== undefined && isInZones(grave, context.actor.attackZones)
        )
    }
    if (context.targetId === undefined) {
        return true
    }
    const target = context.targets.find(
        (candidate) => candidate.id === context.targetId
    )
    return target !== undefined && isInZones(target, context.actor.attackZones)
}
