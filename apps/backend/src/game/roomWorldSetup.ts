import type { GameRoomOptions } from '../ai/roomAi'
import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import type { CompanionService } from './companions'
import type { CharacterController } from './controllers'
import type { NavigationService } from './navigation'
import { resolveNpcIdentitySeed } from './npcIdentityProfiles'
import { resolveNpcSpeechSeed } from './npcSpeechProfiles'
import { bindCityActivationSpawns } from './roomCityActivationSpawns'
import { spawnRoomCharacters } from './roomSpawns'
import { WorldLocations } from './worldLocations'

export function createRoomWorld(
    navigation: NavigationService,
    adventure: AdventureService,
    options: GameRoomOptions
): WorldLocations {
    const world = new WorldLocations(navigation, adventure, options.worldMaps)
    if (options.worldMaps !== undefined) {
        adventure.initializeWorldData(options.worldMaps.adventureData())
    }
    const seed = options.worldSeed ?? options.worldMaps?.seed
    if (seed !== undefined || options.initialBellState !== undefined) {
        adventure.initializeCities({
            seed: seed ?? 'authored-test-world',
            ...(options.initialBellState === undefined
                ? {}
                : { initialBellState: options.initialBellState }),
        })
    }
    return world
}

interface SpawnEnvironment {
    adventure: AdventureService
    world: WorldLocations
    navigation: NavigationService
    characters: Map<string, GameCharacter>
    controllers: Map<string, CharacterController>
    companions: CompanionService
    options: GameRoomOptions
    onRegistered: () => void
}

export function initializeRoomCharacters(environment: SpawnEnvironment) {
    const {
        world,
        navigation,
        characters,
        controllers,
        companions,
        adventure,
        options,
    } = environment
    const speechSeed = resolveNpcSpeechSeed(options.npcSpeechSeed)
    const identitySeed = resolveNpcIdentitySeed(options.npcIdentitySeed)
    const graves = spawnRoomCharacters(
        world,
        navigation,
        characters,
        controllers,
        companions,
        speechSeed,
        identitySeed,
        adventure.cities
    )
    bindCityActivationSpawns({ ...environment, speechSeed, identitySeed })
    return graves
}
