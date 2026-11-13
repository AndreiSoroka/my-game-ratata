import type { AdventureMaterials } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { countInventoryItem } from './inventory'

/** Compatibility summary only; every unit remains an ordinary bag item. */
export function materialSnapshot(actor?: GameCharacter): AdventureMaterials {
    const inventory = actor?.inventory ?? []
    return {
        herbs: countInventoryItem(inventory, 'herbs'),
        fiber: countInventoryItem(inventory, 'fiber'),
        scrap: countInventoryItem(inventory, 'scrap'),
        wood: countInventoryItem(inventory, 'wood'),
        grain: countInventoryItem(inventory, 'grain'),
    }
}
