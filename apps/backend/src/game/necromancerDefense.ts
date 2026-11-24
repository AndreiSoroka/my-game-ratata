import type { Vector2 } from '@my-game-ratata/contracts'
import { ABILITY_DEFINITIONS } from '@my-game-ratata/contracts'

import {
    ashAssaultTarget,
    ashBoundSkeletons,
    ashSkeletonGuard,
    ashSkeletonOrder,
    directAshAssault,
} from './ashSkeletonState'
import type { GameCharacter } from './character'
import { canTargetByFaction } from './factions'
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
import { prayerParameters } from './prayerParameters'
import { pursuits } from './pursuitState'
import type { GameRoom } from './room'
import { savvaTerritorialTarget } from './savvaTerritory'

export const retreatHealthFraction = 0.55
const assaultTargets = new WeakMap<
    GameCharacter,
    { target: GameCharacter; until: number }
>()

export function updateNecromancerEscort(
    actor: GameCharacter,
    scene: NecromancerScene,
    now: number
): void {
    if (scene.threat !== undefined && scene.threat.creatureType !== 'ooze') {
        assaultTargets.set(actor, { target: scene.threat, until: now + 3_000 })
    }
    const target = currentAssault(actor, now)
    for (const skeleton of ashBoundSkeletons(actor)) {
        const follows =
            ashSkeletonGuard(skeleton) === undefined &&
            ashSkeletonOrder(skeleton)?.kind !== 'hunt_slimes'
        directAshAssault(
            skeleton,
            follows && skeleton.locationId === actor.locationId
                ? target
                : undefined
        )
    }
}

function currentAssault(
    actor: GameCharacter,
    now: number
): GameCharacter | undefined {
    const current = assaultTargets.get(actor)
    return current !== undefined &&
        current.until > now &&
        current.target.alive &&
        current.target.locationId === actor.locationId &&
        canTargetByFaction(actor, current.target, now)
        ? current.target
        : undefined
}

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

function imminentNecromancerThreat(
    actor: GameCharacter,
    threat: GameCharacter,
    now: number
): boolean {
    if (savvaTerritorialTarget(actor) === threat) {
        return true
    }
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
        actor.locationId === actor.spawnLocationId &&
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
    if (shouldHideBehindEscort(actor, scene, options)) {
        seekNecromancerSafety(
            actor,
            room,
            scene,
            threat,
            actor.position,
            true,
            now
        )
        return
    }
    for (const tactic of [
        'revive',
        'heal',
        'curse',
        'raise',
        'magic',
    ] as const) {
        const option = options.find((choice) => choice.tactic === tactic)
        if (
            option !== undefined &&
            canUseInDefense(tactic, engaged) &&
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

function canUseInDefense(
    tactic: NecromancerOption['tactic'],
    engaged: boolean
): boolean {
    return engaged || (tactic !== 'magic' && tactic !== 'curse')
}

export function tryNecromancerAid(
    actor: GameCharacter,
    room: GameRoom,
    options: NecromancerOption[],
    now: number
): boolean {
    const aid = options.find(
        ({ tactic }) => tactic === 'revive' || tactic === 'heal'
    )
    return aid !== undefined && performNecromancerTactic(actor, room, aid, now)
}

function shouldHideBehindEscort(
    actor: GameCharacter,
    scene: NecromancerScene,
    options: NecromancerOption[]
): boolean {
    return (
        !options.some(({ tactic }) => tactic === 'curse') &&
        ashBoundSkeletons(actor).some(
            (skeleton) =>
                ashAssaultTarget(skeleton) === scene.threat &&
                !skeleton.tags.has('offline')
        ) &&
        scene.cover?.concealed === true
    )
}

export function aidWoundedSkeleton(
    actor: GameCharacter,
    room: GameRoom,
    scene: NecromancerScene,
    now: number
): boolean {
    if (
        actor.mana < ABILITY_DEFINITIONS.pray_grave.mana ||
        (actor.abilities.availableAt.pray_grave ?? 0) > now
    ) {
        return false
    }
    const group = ashBoundSkeletons(actor)
    const target = scene.visible.find(
        (skeleton) =>
            group.includes(skeleton) && skeleton.hp < skeleton.maxHp * 0.5
    )
    if (target === undefined) {
        return false
    }
    if (
        performNecromancerTactic(
            actor,
            room,
            { tactic: 'heal', targetId: target.id },
            now
        )
    ) {
        return true
    }
    const navigation = room.navigationFor(actor)
    const radius = prayerParameters(
        actor,
        navigation.grid.tileWidth,
        'pray_grave',
        'restore'
    ).radius
    const threat = scene.threat
    const candidates = navigation
        .walkableNeighbors(navigation.worldToTile(target.position))
        .map((tile) => navigation.tileToWorld(tile))
        .filter(
            (point) =>
                distance(point, target.position) <= radius &&
                navigation.hasLineOfSight(point, target.position) &&
                (threat === undefined ||
                    distance(point, threat.position) >=
                        navigation.grid.tileWidth * 2)
        )
        .sort(
            (left, right) =>
                distance(actor.position, left) - distance(actor.position, right)
        )
    return candidates.some((point) =>
        moveNecromancer(actor, room, point, false, now)
    )
}
