import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { attemptAttack } from './combat'
import { resolveRespawnDelayMs } from './roomSimulation'
import type { LocationState } from './worldLocations'

export function attackRoomCharacter(
    actor: GameCharacter,
    targets: GameCharacter[],
    location: LocationState,
    now: number
): GameEventPayload[] {
    const events = attemptAttack({
        actor,
        now,
        respawnDelayMsFor: resolveRespawnDelayMs,
        targets,
        tileSize: location.navigation.grid.tileWidth,
    })
    const chests =
        events.length === 0 ? [] : location.inventory.openChestsHitBy(actor)
    return [...events, ...chests]
}
