import {
    CENTER_LOCATION_ID,
    type ItemId,
    type Vector2,
} from '@my-game-ratata/contracts'

import { GameCharacter } from './character'
import { EconomyWorkerController } from './economyWorkers'
import { createItemInstance, equipDirect } from './inventory'
import { citySpawnPosition } from './mapCityAnchors'
import type { NavigationService } from './navigation'
import { initializeNpcProgression } from './npcProgression'
import type { SpawnedCharacter } from './spawns'
import { walkableNear } from './workerNavigation'
export type WorkerJob = 'lumberjack' | 'miner' | 'farmer'
const jobs: Array<{
    job: WorkerJob
    id: string
    name: string
    tool?: ItemId
    tile: Vector2
}> = [
    {
        job: 'lumberjack',
        id: 'npc_lumberjack_1',
        name: 'Лесник Данила',
        tool: 'axe',
        tile: { x: 39, y: 66 },
    },
    {
        job: 'miner',
        id: 'npc_miner_1',
        name: 'Каменщик Гордей',
        tool: 'pickaxe',
        tile: { x: 43, y: 66 },
    },
    {
        job: 'farmer',
        id: 'npc_farmer_1',
        name: 'Фермер Агафья',
        tile: { x: 35, y: 66 },
    },
]

/** Authored settlement/work roles, independent from current travel or controller. */
export function workerHomeDefinitions() {
    return jobs.map(({ id, job, name }) => ({
        id,
        job,
        name,
        cityId: CENTER_LOCATION_ID,
    }))
}

export function createEconomyWorkers(
    navigation: NavigationService
): SpawnedCharacter[] {
    return jobs.map((definition, index) => {
        const desired = navigation.tileToWorld(definition.tile)
        const character = new GameCharacter({
            id: definition.id,
            nickname: definition.name,
            archetype: 'human',
            controllerKind: 'scripted',
            faction: 'peaceful',
            mortal: true,
            locationId: CENTER_LOCATION_ID,
            spawnPosition:
                navigation.grid.cityAnchors === undefined
                    ? walkableNear(navigation, desired)
                    : citySpawnPosition(
                          navigation,
                          'service.workshop',
                          definition.tile,
                          {
                              x: (index - 1) * navigation.grid.tileWidth,
                              y: index === 1 ? navigation.grid.tileHeight : 0,
                          }
                      ),
            visualId:
                definition.job === 'farmer' ? 'female_player' : 'male_player_2',
            soul: {
                personality:
                    'Работает для города, бережёт инструменты и избегает опасности.',
                controlSource: 'script',
                canSpeak: true,
            },
        })
        character.tags.add(`worker.${definition.job}`)
        initializeNpcProgression(character)
        character.tags.add(`worker.city.${CENTER_LOCATION_ID}`)
        equipDirect(character.equipment, createItemInstance('boots'))
        if (definition.tool !== undefined) {
            equipDirect(
                character.equipment,
                createItemInstance(definition.tool)
            )
        }
        return {
            character,
            controller: new EconomyWorkerController(definition.job),
        }
    })
}
