import { ashSkeletonOrder } from './ashSkeletonState'
import type { GameCharacter } from './character'
import { hasRetaliationRight } from './crimeRelations'
import { hasPersonalHostility } from './personalHostility'

export function canTargetByFaction(
    actor: GameCharacter,
    target: GameCharacter,
    now = Date.now()
): boolean {
    if (actor.id === target.id) {
        return false
    }

    const order = ashSkeletonOrder(actor)
    if (actor.archetype === 'skeleton' && target.creatureType === 'ooze') {
        return order?.kind === 'hunt_slimes' && target.faction === 'monsters'
    }

    if (hasRetaliationRight(actor, target, now)) {
        return true
    }

    if (hasAshAffinity(actor, target) || hasAshAffinity(target, actor)) {
        return false
    }

    if (hasPersonalHostility(actor, target, now)) {
        return true
    }

    const faction = combatFaction(actor)
    if (faction === combatFaction(target)) {
        return false
    }

    return target.reputationWith(faction) <= 0
}

function hasAshAffinity(actor: GameCharacter, target: GameCharacter): boolean {
    return (
        target.creatureType === 'undead' &&
        (actor.ashPact || ashSkeletonOrder(actor)?.ownerAshPact === true)
    )
}

export function combatFaction(actor: GameCharacter) {
    return ashSkeletonOrder(actor)?.ownerFaction ?? actor.faction
}
