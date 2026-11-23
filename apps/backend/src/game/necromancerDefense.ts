import type { Vector2 } from '@my-game-ratata/contracts'
import { ABILITY_DEFINITIONS } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance } from './math'
import {
    fightAsNecromancer,
    moveNecromancer,
    performNecromancerTactic,
} from './necromancerActions'
import { availableSlimeHunter } from './necromancerOptions'
import {
    type NecromancerOption,
    type NecromancerScene,
    necromancerThreats,
} from './necromancerTactics'
import { pursuits } from './pursuitState'
import type { GameRoom } from './room'

export const retreatHealthFraction = 0.55

export function needsNecromancerSafety(
    actor: GameCharacter,
    scene: NecromancerScene,
    now: number
): boolean {
    return (
        actor.hp <= actor.maxHp * retreatHealthFraction ||
        necromancerThreats(actor, scene.visible, now).filter(
            (threat) =>
                distance(actor.position, threat.position) <= 64 &&
                pursuits.get(threat)?.targetId === actor.id
        ).length > 1
    )
}

export function imminentNecromancerThreat(
    actor: GameCharacter,
    threat: GameCharacter,
    now: number
): boolean {
    const separation = distance(actor.position, threat.position)
    return (
        separation <= ABILITY_DEFINITIONS.pray_grave.range &&
        (separation <= 24 ||
            actor.combat.recentDamageUntil > now ||
            pursuits.get(threat)?.targetId === actor.id)
    )
}

export function seekNecromancerSafety(
    actor: GameCharacter,
    room: GameRoom,
    scene: NecromancerScene,
    threat: GameCharacter,
    home: Vector2,
    hide: boolean,
    now: number
): void {
    const separation = distance(actor.position, threat.position)
    const safety = (point: Vector2) =>
        distance(point, threat.position) > separation + 16
    const routeEnd = actor.remainingPath().at(-1)
    if (
        routeEnd !== undefined &&
        distance(routeEnd, threat.position) >= separation
    ) {
        return
    }
    if (
        !hide &&
        safety(home) &&
        moveNecromancer(actor, room, home, false, now)
    ) {
        return
    }
    const cover = scene.cover?.position
    if (
        cover === undefined ||
        !moveNecromancer(actor, room, cover, hide, now)
    ) {
        actor.clearPath()
    }
}

export function defendNecromancer(
    actor: GameCharacter,
    room: GameRoom,
    scene: NecromancerScene,
    threat: GameCharacter,
    options: NecromancerOption[],
    now: number
): void {
    const engaged = imminentNecromancerThreat(actor, threat, now)
    if (!engaged && threat.creatureType === 'ooze') {
        seekNecromancerSafety(
            actor,
            room,
            scene,
            threat,
            actor.spawnPosition,
            false,
            now
        )
        return
    }
    const hunter = engaged ? availableSlimeHunter(actor, scene, now) : undefined
    if (
        hunter !== undefined &&
        performNecromancerTactic(actor, room, hunter, now)
    ) {
        return
    }
    for (const tactic of ['revive', 'heal', 'raise', 'magic'] as const) {
        const option = options.find((choice) => choice.tactic === tactic)
        if (
            option !== undefined &&
            (engaged || tactic !== 'magic') &&
            performNecromancerTactic(actor, room, option, now)
        ) {
            return
        }
    }
    if (engaged) {
        fightAsNecromancer(actor, room, threat, now)
    } else {
        actor.clearPath()
    }
}
