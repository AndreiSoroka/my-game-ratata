import type { GraveSourceDefinition } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { CityWorldState } from './cityWorldState'
import type { CompanionService } from './companions'
import type { CharacterController } from './controllers'
import type { NavigationService } from './navigation'
import { spawnNecromancer } from './necromancerSpawn'
import {
    initializeNpcIdentityProfiles,
    resolveNpcIdentitySeed,
} from './npcIdentityProfiles'
import {
    initializeNpcSpeechProfiles,
    resolveNpcSpeechSeed,
} from './npcSpeechProfiles'
import { registerRoomCharacter } from './roomCharacterRegistration'
import { createFriendlyGirl } from './spawns'
import { createSupportNpcs } from './supportNpcs'
import { createTrainingTargets } from './trainingTargets'
import { createEconomyWorkers } from './workerSpawns'
import { centerLocationId, type WorldLocations } from './worldLocations'
import { createLocationEnemies } from './worldSpawns'

export interface GraveRegistration {
    source: GraveSourceDefinition
    initialChildren: readonly string[]
    reserveRevival?: boolean
}

export function spawnRoomCharacters(
    world: WorldLocations,
    navigation: NavigationService,
    characters: Map<string, GameCharacter>,
    controllers: Map<string, CharacterController>,
    companions: CompanionService,
    npcSpeechSeed?: string,
    npcIdentitySeed?: string,
    cities?: CityWorldState
): GraveRegistration[] {
    const speechSeed = resolveNpcSpeechSeed(npcSpeechSeed)
    const identitySeed = resolveNpcIdentitySeed(npcIdentitySeed)
    const graves: GraveRegistration[] = []
    for (const [locationId, location] of world.locations) {
        const suffix = locationId === centerLocationId ? '' : `_${locationId}`
        const enemies = createLocationEnemies(
            location.navigation,
            location.description
        )
        const necromancer = spawnNecromancer(location)
        for (const source of location.navigation.grid.encounters?.graves ??
            []) {
            graves.push({
                source,
                initialChildren: enemies
                    .filter((enemy) => enemy.graveSourceId === source.id)
                    .map(({ character }) => character.id),
                ...(necromancer === undefined ? {} : { reserveRevival: true }),
            })
        }
        for (const { character, controller } of [
            ...(locationId === centerLocationId
                ? [createFriendlyGirl(location.navigation, suffix)]
                : []),
            ...(necromancer === undefined
                ? []
                : [necromancer, ...necromancer.skeletons]),
            ...enemies,
        ]) {
            registerRoomCharacter(
                { character, controller },
                { characters, controllers, companions },
                locationId
            )
        }
        for (const { character, controller } of createTrainingTargets(
            location.navigation
        )) {
            registerRoomCharacter(
                { character, controller },
                { characters, controllers, companions },
                character.locationId,
                false
            )
        }
    }
    for (const { character, controller } of [
        ...createSupportNpcs(navigation, companions, {
            cityState: (id) => cities?.snapshot(id)?.bellState,
        }),
        ...createEconomyWorkers(navigation),
    ]) {
        registerRoomCharacter(
            { character, controller },
            { characters, controllers, companions }
        )
    }
    initializeNpcSpeechProfiles(characters.values(), speechSeed)
    initializeNpcIdentityProfiles(characters.values(), identitySeed)
    return graves
}
