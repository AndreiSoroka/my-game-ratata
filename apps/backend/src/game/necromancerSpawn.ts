import { WESTERN_RUINS_LOCATION_ID } from '@my-game-ratata/contracts'

import { GameCharacter } from './character'
import { chestHasLineOfSight } from './chestInteraction'
import { syncAbilityConstellations } from './constellations'
import { distance } from './math'
import { NecromancerController } from './necromancerController'
import type { SpawnedCharacter } from './spawns'
import type { LocationState } from './worldLocations'

export function spawnNecromancer(
    location: LocationState
): SpawnedCharacter | undefined {
    const { navigation, inventory } = location
    const refuge = navigation.grid.encounters?.ashRefuge
    if (
        location.description.id !== WESTERN_RUINS_LOCATION_ID ||
        refuge === undefined
    ) {
        return undefined
    }
    const chest = inventory.containers.ritualChest(refuge.chestId)
    const landmarks = (navigation.grid.landmarks ?? []).filter(({ kind }) =>
        ['ash_headstone', 'ash_grave', 'ash_collapse'].includes(kind)
    )
    const road = navigation.tileToWorld({
        x: Math.floor(navigation.grid.width / 2),
        y: Math.floor(navigation.grid.height / 2),
    })
    if (
        chest === undefined ||
        distance(chest.position, refuge.chest) > navigation.grid.tileWidth ||
        !chestHasLineOfSight(refuge.home, chest.position, navigation) ||
        new Set(landmarks.map(({ kind }) => kind)).size !== 3 ||
        navigation.findPathWorld(road, refuge.home).length === 0 ||
        landmarks.some(
            ({ position }) =>
                navigation.findPathWorld(refuge.home, position).length === 0
        )
    ) {
        throw new Error(
            'Generated Ash refuge must be reachable with a chest and three landmarks'
        )
    }
    const character = new GameCharacter({
        id: 'npc_necromancer_1',
        nickname: 'Савва',
        npcIdentityKey: 'savva',
        archetype: 'human',
        controllerKind: 'scripted',
        ashPact: true,
        faction: 'peaceful',
        mortal: true,
        respawnPolicy: 'none',
        locationId: location.description.id,
        spawnPosition: refuge.home,
        visualId: 'necromancer',
    })
    character.progression.patron = 'grave'
    character.abilities.known.add('pray_grave')
    character.progression.masteries.prayer_grave.level = 5
    syncAbilityConstellations(character)
    character.maxHp = 100
    character.hp = character.maxHp

    const mound = landmarks.find(({ kind }) => kind === 'ash_grave')
    if (mound !== undefined) {
        inventory.deathLoot.seedRemains(mound.id, mound.position)
    }
    return {
        character,
        controller: new NecromancerController({
            home: refuge.home,
            landmarks,
            chestId: refuge.chestId,
        }),
    }
}
