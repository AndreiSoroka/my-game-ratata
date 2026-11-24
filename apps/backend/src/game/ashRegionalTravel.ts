import { type Vector2, WORLD_DIRECTIONS } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance } from './math'
import type { NavigationService } from './navigation'
import {
    type RegionalExit,
    regionalExit,
    regionalRoute,
} from './regionalNavigation'

interface TravelLeg {
    from: string
    destination: string
    exit: RegionalExit | undefined
    retryAt: number
    readyAt?: number
}

const legs = new WeakMap<GameCharacter, TravelLeg>()

export function advanceAshRegionalTravel(
    actor: GameCharacter,
    destination: string,
    navigation: NavigationService,
    now: number
): boolean {
    let leg = legs.get(actor)
    if (
        leg?.from !== actor.locationId ||
        leg.destination !== destination ||
        (leg.exit === undefined && now >= leg.retryAt)
    ) {
        leg = planLeg(actor, destination, navigation, now)
        legs.set(actor, leg)
    }
    if (leg.exit === undefined) {
        return false
    }
    if (distance(actor.position, leg.exit.point) <= 0.01) {
        actor.clearPath()
        leg.readyAt = now
    } else if (
        !actor.hasPath() ||
        distance(
            actor.remainingPath().at(-1) ?? actor.position,
            leg.exit.point
        ) > 0.01
    ) {
        actor.setPath(navigation.findPathWorld(actor.position, leg.exit.point))
    }
    return actor.hasPath() || leg.readyAt === now
}

function planLeg(
    actor: GameCharacter,
    destination: string,
    navigation: NavigationService,
    now: number
): TravelLeg {
    const from = actor.locationId
    const next = regionalRoute(from, destination)?.[1]
    return {
        from,
        destination,
        exit:
            next === undefined
                ? undefined
                : regionalExit(actor.position, from, next, navigation),
        retryAt: now + 1_000,
    }
}

export function ashRegionalTravelIntent(
    actor: GameCharacter,
    now: number
): Vector2 | undefined {
    const leg = legs.get(actor)
    return leg?.from === actor.locationId &&
        leg.readyAt === now &&
        leg.exit !== undefined
        ? WORLD_DIRECTIONS[leg.exit.direction]
        : undefined
}
