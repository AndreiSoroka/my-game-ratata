import type { GraveSourceDefinition } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { PolicyController } from './companionControllers'
import type { CompanionService } from './companions'
import type { CharacterController } from './controllers'
import type { NavigationService } from './navigation'
import {
    initializeNpcSpeechProfiles,
    resolveNpcSpeechSeed,
} from './npcSpeechProfiles'
import { createFriendlyGirl } from './spawns'
import { createSupportNpcs } from './supportNpcs'
import { createTrainingTargets } from './trainingTargets'
import { createEconomyWorkers } from './workerSpawns'
import { centerLocationId, type WorldLocations } from './worldLocations'
import { createLocationEnemies } from './worldSpawns'

export interface GraveRegistration {
    source: GraveSourceDefinition
    initialChildren: readonly string[]
}

export function spawnRoomCharacters(
    world: WorldLocations,
    navigation: NavigationService,
    characters: Map<string, GameCharacter>,
    controllers: Map<string, CharacterController>,
    companions: CompanionService,
    npcSpeechSeed?: string
): GraveRegistration[] {
    const speechSeed = resolveNpcSpeechSeed(npcSpeechSeed)
    const graves: GraveRegistration[] = []
    for (const [locationId, location] of world.locations) {
        const suffix = locationId === centerLocationId ? '' : `_${locationId}`
        const enemies = createLocationEnemies(
            location.navigation,
            location.description
        )
        for (const source of location.navigation.grid.encounters?.graves ??
            []) {
            graves.push({
                source,
                initialChildren: enemies
                    .filter((enemy) => enemy.graveSourceId === source.id)
                    .map(({ character }) => character.id),
            })
        }
        for (const { character, controller } of [
            ...(locationId === centerLocationId
                ? [createFriendlyGirl(location.navigation, suffix)]
                : []),
            ...enemies,
        ]) {
            character.locationId = locationId
            characters.set(character.id, character)
            controllers.set(
                character.id,
                new PolicyController(companions, controller)
            )
        }
        for (const { character, controller } of createTrainingTargets(
            location.navigation
        )) {
            characters.set(character.id, character)
            controllers.set(character.id, controller)
        }
    }
    for (const { character, controller } of [
        ...createSupportNpcs(navigation, companions),
        ...createEconomyWorkers(navigation),
    ]) {
        characters.set(character.id, character)
        controllers.set(
            character.id,
            new PolicyController(companions, controller)
        )
    }
    initializeNpcSpeechProfiles(characters.values(), speechSeed)
    return graves
}
