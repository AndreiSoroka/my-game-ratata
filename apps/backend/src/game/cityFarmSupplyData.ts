import {
    CENTER_LOCATION_ID,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'

export function assignedFarmCity(actor: GameCharacter): string | undefined {
    return actor.tags.has('worker.farmer')
        ? WORLD_LOCATION_DEFINITIONS.find(
              (location) =>
                  location.biome === 'city' &&
                  actor.tags.has(`worker.city.${location.id}`)
          )?.id
        : undefined
}

/** Authored municipal jobs use the same character rules under every controller. */
export const CITY_FARM_SUPPLIERS = [
    { cityId: CENTER_LOCATION_ID, npcId: 'npc_merchant_1' },
] as const
