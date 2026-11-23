import {
    getWorldLocationDefinition,
    type Vector2,
    WORLD_DIRECTIONS,
    type WorldDirection,
    worldLocationNeighbor,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { available, humanControlled } from './crimeRules'
import { distance, normalize, zeroVector } from './math'
import type { NavigationService } from './navigation'
import { pursuits, settlePursuitHome, territories } from './pursuitState'
import { type RegionalExit, regionalExit } from './regionalNavigation'

interface FleeExitPlan {
    from: string
    exit: RegionalExit
    expiresAt: number
    updatedAt: number
    atEdge: boolean
}

const fleeExitPlans = new WeakMap<GameCharacter, FleeExitPlan>()
const fleeExitMs = 5000
const fleeDistance = 80

export function shouldFlee(
    character: GameCharacter,
    target: GameCharacter
): boolean {
    return (
        (character.hp / character.maxHp <= 0.35 ||
            !character.canSpendAttackResources()) &&
        distance(character.position, target.position) < fleeDistance
    )
}

export function planMobFlee(
    actor: GameCharacter,
    threat: Vector2,
    navigation: NavigationService,
    now: number
): void {
    const direction = normalize({
        x: actor.position.x - threat.x,
        y: actor.position.y - threat.y,
    })
    if (!planMobFleeExit(actor, direction, navigation, now)) {
        actor.setPath(localFleePath(actor.position, direction, navigation))
    }
}

function mayLeaveWhileFleeing(actor: GameCharacter): boolean {
    return (
        actor.archetype === 'slime' &&
        !territories.has(actor) &&
        pursuits.get(actor)?.foreign === undefined &&
        getWorldLocationDefinition(actor.locationId)?.biome !== 'city' &&
        getWorldLocationDefinition(actor.spawnLocationId)?.biome !== 'city'
    )
}

function planMobFleeExit(
    actor: GameCharacter,
    direction: Vector2,
    navigation: NavigationService,
    now: number
): boolean {
    if (!mayLeaveWhileFleeing(actor)) {
        return false
    }
    const edge = projectedFleeEdge(actor.position, direction, navigation)
    if (edge === undefined) {
        return false
    }

    const next = worldLocationNeighbor(actor.locationId, edge.direction)
    if (next === undefined || next.biome === 'city') {
        return false
    }

    const exit = regionalExit(
        actor.position,
        actor.locationId,
        next.id,
        navigation,
        edge.point
    )
    if (exit === undefined) {
        return false
    }

    actor.setPath(navigation.findPathWorld(actor.position, exit.point))
    fleeExitPlans.set(actor, {
        from: actor.locationId,
        exit,
        expiresAt: now + fleeExitMs,
        updatedAt: now,
        atEdge: false,
    })
    return advanceMobFleeExit(actor, navigation, now)
}

export function advanceMobFleeExit(
    actor: GameCharacter,
    navigation: NavigationService,
    now: number
): boolean {
    const plan = fleeExitPlans.get(actor)
    if (plan === undefined) {
        return false
    }
    if (plan.from !== actor.locationId || now >= plan.expiresAt) {
        cancelMobFleeExit(actor)
        return false
    }
    plan.atEdge = distance(actor.position, plan.exit.point) <= 0.01
    if (!plan.atEdge && !actor.hasPath()) {
        actor.setPath(navigation.findPathWorld(actor.position, plan.exit.point))
        if (!actor.hasPath()) {
            cancelMobFleeExit(actor)
            return false
        }
    }
    plan.updatedAt = now
    return true
}

export function cancelMobFleeExit(actor: GameCharacter): void {
    const plan = fleeExitPlans.get(actor)
    if (plan?.from === actor.locationId) {
        actor.clearPath()
    }
    fleeExitPlans.delete(actor)
}

export function mobFleeTravelIntent(
    actor: GameCharacter,
    now: number
): Vector2 | undefined {
    const plan = currentFleeExit(actor, now)
    if (plan === undefined) {
        return undefined
    }
    return plan.atEdge ? WORLD_DIRECTIONS[plan.exit.direction] : zeroVector()
}

export function canMobFleeTravel(
    actor: GameCharacter,
    to: string,
    now: number
): boolean {
    const plan = currentFleeExit(actor, now)
    return plan?.atEdge === true && plan.exit.nextLocationId === to
}

export function recordMobFleeArrival(
    actor: GameCharacter,
    now: number
): boolean {
    const plan = fleeExitPlans.get(actor)
    if (
        plan?.updatedAt !== now ||
        !plan.atEdge ||
        plan.exit.nextLocationId !== actor.locationId
    ) {
        return false
    }
    fleeExitPlans.delete(actor)
    settlePursuitHome(actor)
    return true
}

function currentFleeExit(
    actor: GameCharacter,
    now: number
): FleeExitPlan | undefined {
    // A later tick can hand control to another policy, so this intent must be fresh.
    const plan = fleeExitPlans.get(actor)
    return plan?.updatedAt === now &&
        plan.from === actor.locationId &&
        available(actor) &&
        !humanControlled(actor)
        ? plan
        : undefined
}

function localFleePath(
    position: Vector2,
    direction: Vector2,
    navigation: NavigationService
): Vector2[] {
    for (const angle of [0, 35, -35, 70, -70, 140, -140]) {
        const candidate = rotate(direction, angle)
        const path = navigation.findPathWorld(position, {
            x: position.x + candidate.x * fleeDistance,
            y: position.y + candidate.y * fleeDistance,
        })
        if (path.length > 0) {
            return path
        }
    }
    return []
}

function rotate(vector: Vector2, degrees: number): Vector2 {
    const radians = (degrees * Math.PI) / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    return {
        x: vector.x * cos - vector.y * sin,
        y: vector.x * sin + vector.y * cos,
    }
}

function projectedFleeEdge(
    position: Vector2,
    direction: Vector2,
    navigation: NavigationService
): { direction: WorldDirection; point: Vector2 } | undefined {
    const { tileWidth, tileHeight, worldWidth, worldHeight } =
        navigation.summary
    const edgeX = direction.x < 0 ? tileWidth / 2 : worldWidth - tileWidth / 2
    const edgeY =
        direction.y < 0 ? tileHeight / 2 : worldHeight - tileHeight / 2
    const xDistance =
        direction.x === 0 ? Infinity : (edgeX - position.x) / direction.x
    const yDistance =
        direction.y === 0 ? Infinity : (edgeY - position.y) / direction.y
    const edgeDistance = Math.min(xDistance, yDistance)
    if (edgeDistance > fleeDistance) {
        return undefined
    }

    return {
        direction:
            xDistance <= yDistance
                ? direction.x > 0
                    ? 'east'
                    : 'west'
                : direction.y > 0
                  ? 'south'
                  : 'north',
        point: {
            x: position.x + direction.x * edgeDistance,
            y: position.y + direction.y * edgeDistance,
        },
    }
}
