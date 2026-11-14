import type {
    GameEventPayload,
    WorldCombatTarget,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { attemptAttack } from './combat'
import type { GraveCombatContext } from './graveRules'
import { resolveRespawnDelayMs } from './roomSimulation'
import type { LocationState } from './worldLocations'

export function attackRoomCharacter(
    actor: GameCharacter,
    targets: GameCharacter[],
    location: LocationState,
    now: number,
    targetId?: string,
    target?: WorldCombatTarget,
    graves?: GraveCombatContext
): GameEventPayload[] {
    const events = attemptAttack({
        actor,
        now,
        targetId,
        target,
        graves,
        navigation: location.navigation,
        respawnDelayMsFor: resolveRespawnDelayMs,
        targets,
        tileSize: location.navigation.grid.tileWidth,
    })
    const chests =
        events.length === 0 || target !== undefined
            ? []
            : location.inventory.openChestsHitBy(actor)
    return [...events, ...chests]
}
