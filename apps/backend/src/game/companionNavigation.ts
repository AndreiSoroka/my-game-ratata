import { type Vector2, WORLD_DIRECTIONS } from '@my-game-ratata/contracts'

import type { CompanionWorld } from './agentDecisions'
import type { GameCharacter } from './character'
import type { CompanionRuntime } from './companionMovement'
import { findActorPath } from './doorNavigation'
import type { DungeonPassage } from './dungeonMapData'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { type RegionalExit, regionalExit } from './regionalNavigation'
import { isInsideDungeonPassage, nextLocationToward } from './worldPassages'

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
    now: number,
    destinationPassage?: DungeonPassage
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
            exit: travelExit(
                character,
                destination,
                navigation,
                destinationPassage
            ),
        }
        state.regionalLeg = leg
    }
    if (leg.exit === undefined) {
        character.setPath([])
        return
    }
    if ('passage' in leg.exit) {
        const { passage } = leg.exit
        // The shared crossing rule requires movement into the trigger from outside.
        const point = isInsideDungeonPassage(character.position, passage)
            ? passage.arrival
            : passage.position
        planCompanionPath(character, point, state, world, now)
        return
    }
    if (distance(character.position, leg.exit.point) <= 1) {
        character.setMoveInput(WORLD_DIRECTIONS[leg.exit.direction])
        return
    }
    planCompanionPath(character, leg.exit.point, state, world, now)
}

function travelExit(
    character: GameCharacter,
    destination: string,
    navigation: NavigationService,
    destinationPassage: DungeonPassage | undefined
): CompanionTravelLeg['exit'] {
    const passage = navigation.grid.dungeonPassage
    const next = nextLocationToward(character.locationId, destination, (id) => {
        if (id === character.locationId) {
            return passage
        }
        return id === destination ? destinationPassage : undefined
    })
    if (next === undefined) {
        return undefined
    }
    return passage?.destinationLocationId === next
        ? { passage }
        : regionalExit(
              character.position,
              character.locationId,
              next,
              navigation
          )
}

export function planCompanionPath(
    character: GameCharacter,
    target: Vector2,
    state: CompanionRuntime,
    world: CompanionWorld,
    now: number
): void {
    if (character.hasPath() && now - state.lastPlanAt < 300) {
        return
    }
    character.setPath(
        findActorPath(world.navigationFor(character), character, target)
    )
    state.lastPlanAt = now
}
