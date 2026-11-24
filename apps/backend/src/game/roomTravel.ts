import {
    getWorldLocationDefinition,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { rememberObservedCrossing } from './characterControl'
import { quickShotBlocksMovement } from './combatArchery'
import { canWalkDuringPrayer, sparkBlocksTravel } from './combatMovement'
import { magicBlocksMovement } from './magicState'
import { mobFleeTravelIntent } from './mobFlee'
import { rememberPursuitExit } from './pursuitTravel'
import { type RoomSocket, send } from './roomMessaging'
import type { WorldLocations } from './worldLocations'

export function characterMovementIntent(
    character: GameCharacter,
    now: number,
    deltaMs: number
): Vector2 {
    const flee = mobFleeTravelIntent(character, now)
    if (flee !== undefined) {
        return flee
    }
    if (
        character.movement.dashUntil > now - deltaMs &&
        character.movement.dashStartedAt < now
    ) {
        return character.movement.dashDirection
    }
    const input = character.getMoveInput()
    const point = character.nextPathPoint()
    return input.x !== 0 || input.y !== 0 || point === undefined
        ? input
        : {
              x: point.x - character.position.x,
              y: point.y - character.position.y,
          }
}

export function travelRoomCharacter(
    character: GameCharacter,
    intent: Vector2,
    world: WorldLocations,
    characters: ReadonlyMap<string, GameCharacter>,
    now: number
): string | undefined {
    if (
        !character.alive ||
        character.tags.has('offline') ||
        quickShotBlocksMovement(character) ||
        sparkBlocksTravel(character) ||
        (character.isActionLocked(now) && !canWalkDuringPrayer(character)) ||
        magicBlocksMovement(character, now) ||
        character.stunUntil > now
    ) {
        return undefined
    }
    const from = character.locationId
    const edge = { ...character.position }
    const navigation = world.get(from).navigation
    const notice = world.travel(character, intent, now)
    if (from !== character.locationId) {
        const previous = getWorldLocationDefinition(from)
        const next = getWorldLocationDefinition(character.locationId)
        if (previous !== undefined && next !== undefined) {
            rememberPursuitExit(
                character,
                from,
                edge,
                {
                    x: next.column - previous.column,
                    y: next.row - previous.row,
                },
                characters.values(),
                navigation,
                now
            )
            rememberObservedCrossing(
                character,
                from,
                edge,
                {
                    x: next.column - previous.column,
                    y: next.row - previous.row,
                },
                characters.values(),
                navigation,
                now
            )
        }
    }
    return notice
}

export function sendTravelNotice(
    character: GameCharacter,
    notice: string,
    {
        connections,
        now,
    }: { connections: ReadonlyMap<RoomSocket, string | undefined>; now: number }
): void {
    for (const [ws, id] of connections) {
        if (id === character.id) {
            send(ws, {
                type: 'event',
                serverTime: now,
                event: { kind: 'notice', actorId: id, text: notice },
            })
        }
    }
}
