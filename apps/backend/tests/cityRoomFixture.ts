import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { vi } from 'vitest'

import type { GameRoomOptions } from '../src/ai/roomAi'
import type { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import * as worldSpawns from '../src/game/worldSpawns'

/** Preserve the authored city and ordinary room loop for tests local to its streets. */
export function createCityTestRoom(
    navigation?: NavigationService,
    options?: GameRoomOptions
): GameRoom {
    const createEnemies = worldSpawns.createLocationEnemies
    const spawn = vi
        .spyOn(worldSpawns, 'createLocationEnemies')
        .mockImplementation((map, location, seed) =>
            location.id === CENTER_LOCATION_ID
                ? createEnemies(map, location, seed)
                : []
        )
    try {
        return new GameRoom(navigation, options)
    } finally {
        spawn.mockRestore()
    }
}
