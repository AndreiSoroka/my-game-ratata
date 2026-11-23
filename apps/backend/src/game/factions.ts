import { ashSkeletonOrder } from './ashSkeletonState'
import type { GameCharacter } from './character'
import { hasRetaliationRight } from './crimeRelations'
import { hasGroupHostility, hasPersonalHostility } from './personalHostility'

export function canTargetByFaction(
    actor: GameCharacter,
    target: GameCharacter,
    now = Date.now()
): boolean {
    if (actor.id === target.id) {
        return false
    }

    if (
        hasRetaliationRight(actor, target, now) ||
        hasPersonalHostility(actor, target, now) ||
        hasGroupHostility(actor, target)
    ) {
        return true
    }
    return factionEnemy(actor, target)
}

/** Practice and objective credit come only from intrinsic opposing allegiances. */
export function isPveOpponent(
    actor: GameCharacter,
    target: GameCharacter
): boolean {
    return (
        actor !== target &&
        combatFaction(actor) !== combatFaction(target) &&
        factionEnemy(actor, target)
    )
}

function factionEnemy(actor: GameCharacter, target: GameCharacter): boolean {
    if (actor.archetype === 'skeleton' && target.creatureType === 'ooze') {
        return (
            ashSkeletonOrder(actor)?.kind === 'hunt_slimes' &&
            target.faction === 'monsters'
        )
    }
    if (hasAshAffinity(actor, target) || hasAshAffinity(target, actor)) {
        return false
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
