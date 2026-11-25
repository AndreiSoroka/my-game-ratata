import {
    CENTER_LOCATION_ID,
    GRID_SIZE,
    REGION_NAME,
    type WorldLocation,
    type WorldLocationDefinition,
} from '@my-game-ratata/contracts'

import type { CorpseWallet } from './corpseWallet'
import { DungeonSecrets } from './dungeonSecrets'
import { loadNavigationService, NavigationService } from './navigation'
import { WorldInventory } from './worldInventory'
import type { WorldMaps } from './worldMaps'

export interface LocationState {
    description: WorldLocation
    inventory: WorldInventory
    navigation: NavigationService
    secrets?: DungeonSecrets
}

export function createLocationState(
    definition: WorldLocationDefinition,
    center: NavigationService,
    wallet: CorpseWallet | undefined,
    maps: WorldMaps | undefined
): LocationState {
    const { id } = definition
    const navigation = navigationForLocation(definition, center, maps)
    const definitions = maps?.secretDefinitions(id)
    const inventory = new WorldInventory(navigation, id, wallet)
    return {
        description: {
            ...definition,
            columns: GRID_SIZE,
            rows: GRID_SIZE,
            regionName: REGION_NAME,
            map: { ...navigation.summary, id },
        },
        inventory,
        ...(definitions === undefined
            ? {}
            : {
                  secrets: new DungeonSecrets(
                      definitions,
                      navigation,
                      inventory
                  ),
              }),
        navigation,
    }
}

function navigationForLocation(
    { id, biome }: WorldLocationDefinition,
    center: NavigationService,
    maps: WorldMaps | undefined
): NavigationService {
    if (id === CENTER_LOCATION_ID) {
        return center
    }
    if (maps !== undefined) {
        const navigation = maps.navigation(id)
        return biome === 'dungeon' ? dungeonNavigation(navigation) : navigation
    }
    return center.grid.id === 'map1' || center.grid.id === CENTER_LOCATION_ID
        ? loadNavigationService(id)
        : new NavigationService({ ...center.grid, id })
}

function dungeonNavigation(source: NavigationService): NavigationService {
    const { solid, baseSolid, surfaces, ...grid } = source.grid
    return new NavigationService({
        ...grid,
        solid: solid.slice(),
        ...(baseSolid === undefined ? {} : { baseSolid: baseSolid.slice() }),
        ...(surfaces === undefined ? {} : { surfaces: surfaces.slice() }),
    })
}
