import {
    getWorldLocationDefinition,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'
import { sparkBlocksTravel } from './combatMovement'
import { segmentDistanceSquared } from './constellationGeometry'
import { available } from './crimeRules'
import type { DungeonPassage } from './dungeonMapData'
import { magicBlocksMovement } from './magicState'
import { distance } from './math'
import { cancelMovementMode } from './movementActions'
import type { NavigationService } from './navigation'
import { regionalRoute } from './regionalNavigation'

const passageRadius = 7

export function canUsePassage(character: GameCharacter, now: number): boolean {
    return (
        available(character) &&
        character.trainingTarget === undefined &&
        character.stunUntil <= now &&
        !character.isActionLocked(now) &&
        !sparkBlocksTravel(character) &&
        !character.combat.defensiveStance &&
        !magicBlocksMovement(character, now)
    )
}

export function stopForPassage(character: GameCharacter): void {
    cancelCharacterControl(character)
    character.setMoveInput({ x: 0, y: 0 })
    cancelMovementMode(character)
}

export function crossedDungeonPassage(
    navigation: NavigationService,
    before: Vector2 | undefined,
    after: Vector2,
    intent: Vector2
): DungeonPassage | undefined {
    const passage = navigation.grid.dungeonPassage
    if (
        passage === undefined ||
        before === undefined ||
        (intent.x === 0 && intent.y === 0) ||
        distance(before, passage.position) <= passageRadius ||
        segmentDistanceSquared(passage.position, before, after) >
            passageRadius ** 2 ||
        !navigation.hasLineOfSight(before, passage.position)
    ) {
        return undefined
    }
    return passage
}

export function validateDungeonLink(
    navigation: NavigationService,
    to: string
): void {
    const passage = navigation.grid.dungeonPassage
    if (
        passage?.destinationLocationId !== to ||
        distance(passage.position, passage.arrival) <= passageRadius ||
        navigation.isSolidTile(navigation.worldToTile(passage.position)) ||
        navigation.isSolidTile(navigation.worldToTile(passage.arrival)) ||
        navigation.findPathWorld(passage.arrival, passage.position).length === 0
    ) {
        throw new Error(
            `Invalid dungeon link from ${navigation.grid.id} to ${to}`
        )
    }
}

export function nextLocationToward(
    fromId: string,
    toId: string,
    passageAt: (id: string) => DungeonPassage | undefined
): string | undefined {
    if (fromId === toId) {
        return undefined
    }
    if (getWorldLocationDefinition(fromId) === undefined) {
        return passageAt(fromId)?.destinationLocationId
    }
    const targetSurface =
        getWorldLocationDefinition(toId) === undefined
            ? passageAt(toId)?.destinationLocationId
            : toId
    if (targetSurface === fromId) {
        return toId
    }
    return targetSurface === undefined
        ? undefined
        : regionalRoute(fromId, targetSurface)?.[1]
}
