import type { AdventureResourceNode } from '@my-game-ratata/contracts'

import { AdventureResources } from './adventureResources'
import type { AdventureActionResult } from './adventureTrading'
import type { GameCharacter } from './character'
import type { CityEconomyService } from './cityEconomy'
import type { CityWorldState } from './cityWorldState'
import { executeContainerCommand } from './containerCommands'
import type { HarvestDrops } from './harvestWork'
import type { InventoryItemInstance } from './inventory'
import type { NavigationService } from './navigation'
import type { WorldLocations } from './worldLocations'
import type { WorldObjectDefinition } from './worldObjectData'
import { WorldObjects } from './worldObjects'

export interface AdventureServiceOptions {
    farmRandom?: () => number
    harvestDrops?: HarvestDrops
    openContainer?: (
        actor: GameCharacter,
        id: string,
        now: number
    ) => AdventureActionResult
    now?: () => number
    navigationForLocation?: (id: string) => NavigationService
    resourceNodes?: AdventureResourceNode[]
    worldObjects?: WorldObjectDefinition[]
}

export function createAdventureEnvironment(
    options: AdventureServiceOptions,
    economy: () => CityEconomyService,
    cities?: CityWorldState
): [AdventureResources, WorldObjects] {
    return [
        new AdventureResources(
            options.resourceNodes,
            (actor, recipeId, instanceId) =>
                economy().recordCraftOutput(actor, recipeId, instanceId),
            options.harvestDrops,
            options.farmRandom
        ),
        new WorldObjects(
            options.worldObjects,
            options.openContainer,
            cities,
            options.navigationForLocation
        ),
    ]
}

/** One world inventory for human commands, scripted work and agent intentions. */
export function adventureWorldOptions(world: () => WorldLocations) {
    return {
        navigationForLocation: (id: string) => world().get(id).navigation,
        openContainer: (actor: GameCharacter, id: string, now: number) =>
            executeContainerCommand(
                world().get(actor.locationId).inventory.containers,
                actor,
                { type: 'open_chest', chestId: id },
                now
            ),
        harvestDrops: {
            random: Math.random,
            drop: (actor: GameCharacter, item: InventoryItemInstance) =>
                world()
                    .get(actor.locationId)
                    .inventory.dropItemNear(item, actor.position),
        },
    }
}
