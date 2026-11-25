import { type Vector2, WORLD_DIRECTIONS } from '@my-game-ratata/contracts'

import type { CompanionWorld } from './agentDecisions'
import type { GameCharacter } from './character'
import type { CompanionRuntime } from './companionMovement'
import { findActorPath } from './doorNavigation'
import type { DungeonPassage } from './dungeonMapData'
import { distance } from './math'
import type { NavigationService, TileCoordinate } from './navigation'
import {
    type RegionalExit,
    regionalExit,
    regionalRoute,
} from './regionalNavigation'
import {
    dungeonPassageApproach,
    dungeonPassageTo,
    outsideUnchosenPassages,
} from './worldPassages'

export interface CompanionTravelLeg {
    from: string
    to: string
    exit: RegionalExit | { passage: DungeonPassage } | undefined
    plannedAt: number
}

export function advanceCompanionTravel(
    character: GameCharacter,
    destination: string,
    state: CompanionRuntime,
    world: CompanionWorld,
    now: number
): void {
    const navigation = world.navigationFor(character)
    let leg = state.regionalLeg
    if (
        leg?.from !== character.locationId ||
        leg.to !== destination ||
        (leg.exit === undefined && now >= leg.plannedAt + 1_000)
    ) {
        leg = {
            from: character.locationId,
            to: destination,
            plannedAt: now,
            exit: travelExit(character, destination, navigation, world),
        }
        state.regionalLeg = leg
    }
    if (leg.exit === undefined) {
        character.setPath([])
        return
    }
    if ('passage' in leg.exit) {
        const { passage } = leg.exit
        planCompanionPath(
            character,
            dungeonPassageApproach(character.position, passage),
            state,
            world,
            now,
            (tile) => outsideUnchosenPassages(navigation, tile, passage)
        )
        return
    }
    if (distance(character.position, leg.exit.point) <= 1) {
        character.setMoveInput(WORLD_DIRECTIONS[leg.exit.direction])
        return
    }
    planCompanionPath(character, leg.exit.point, state, world, now, (tile) =>
        outsideUnchosenPassages(navigation, tile)
    )
}

function travelExit(
    character: GameCharacter,
    destination: string,
    navigation: NavigationService,
    world: CompanionWorld
): CompanionTravelLeg['exit'] {
    const from = character.locationId
    const next =
        world.nextLocationToward?.(from, destination) ??
        regionalRoute(from, destination)?.[1]
    if (next === undefined) {
        return undefined
    }
    const passage = dungeonPassageTo(navigation, next)
    return passage !== undefined
        ? { passage }
        : regionalExit(
              character.position,
              from,
              next,
              navigation,
              undefined,
              (point) =>
                  findActorPath(
                      navigation,
                      character,
                      point,
                      character.position,
                      (tile) => outsideUnchosenPassages(navigation, tile)
                  )
          )
}

export function planCompanionPath(
    character: GameCharacter,
    target: Vector2,
    state: CompanionRuntime,
    world: CompanionWorld,
    now: number,
    canVisit?: (tile: TileCoordinate) => boolean
): void {
    if (character.hasPath() && now - state.lastPlanAt < 300) {
        return
    }
    character.setPath(
        findActorPath(
            world.navigationFor(character),
            character,
            target,
            character.position,
            canVisit
        )
    )
    state.lastPlanAt = now
}
