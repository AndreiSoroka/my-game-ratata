import type { GameCharacter } from './character'
import { PolicyController } from './companionControllers'
import type { CompanionService } from './companions'
import type { CharacterController } from './controllers'
import type { NavigationService } from './navigation'
import { createFriendlyGirl } from './spawns'
import { createSupportNpcs } from './supportNpcs'
import { centerLocationId, type WorldLocations } from './worldLocations'
import { createLocationEnemies } from './worldSpawns'

export function spawnRoomCharacters(
    world: WorldLocations,
    navigation: NavigationService,
    characters: Map<string, GameCharacter>,
    controllers: Map<string, CharacterController>,
    companions: CompanionService
): void {
    for (const [locationId, location] of world.locations) {
        const suffix = locationId === centerLocationId ? '' : `_${locationId}`
        for (const { character, controller } of [
            ...(locationId === centerLocationId
                ? [createFriendlyGirl(location.navigation, suffix)]
                : []),
            ...createLocationEnemies(location.navigation, location.description),
        ]) {
            character.locationId = locationId
            characters.set(character.id, character)
            controllers.set(
                character.id,
                new PolicyController(companions, controller)
            )
        }
    }
    for (const { character, controller } of createSupportNpcs(
        navigation,
        companions
    )) {
        characters.set(character.id, character)
        controllers.set(
            character.id,
            new PolicyController(companions, controller)
        )
    }
}
