import type { GameCharacter } from './character'
import { PolicyController } from './companionControllers'
import type { CompanionService } from './companions'
import type { CharacterController } from './controllers'
import type { SpawnedCharacter } from './spawns'

export interface CharacterRegistrationEnvironment {
    characters: Map<string, GameCharacter>
    controllers: Map<string, CharacterController>
    companions: CompanionService
}

/** Initial content and later authored spawns enter the identical authoritative character registry. */
export function registerRoomCharacter(
    entry: SpawnedCharacter,
    environment: CharacterRegistrationEnvironment,
    locationId = entry.character.locationId,
    policy = true
): boolean {
    if (environment.characters.has(entry.character.id)) {
        return false
    }
    entry.character.locationId = locationId
    environment.characters.set(entry.character.id, entry.character)
    environment.controllers.set(
        entry.character.id,
        policy
            ? new PolicyController(environment.companions, entry.controller)
            : entry.controller
    )
    return true
}
