import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import type { CompanionService } from './companions'
import type { CharacterController } from './controllers'
import type { NavigationService } from './navigation'
import { initializeNpcIdentityProfiles } from './npcIdentityProfiles'
import { seedNpcPockets } from './npcPockets'
import { initializeNpcSpeechProfiles } from './npcSpeechProfiles'
import { registerRoomCharacter } from './roomCharacterRegistration'
import { createSupportNpcs } from './supportNpcs'

interface ActivationEnvironment {
    adventure: AdventureService
    navigation: NavigationService
    characters: Map<string, GameCharacter>
    controllers: Map<string, CharacterController>
    companions: CompanionService
    speechSeed: string
    identitySeed: string
    onRegistered?: () => void
}

/** Authored activation content uses the same character factories and controller policy as startup. */
export function bindCityActivationSpawns(
    environment: ActivationEnvironment
): () => void {
    return environment.adventure.cities.onActivation((cityId) => {
        const ids =
            environment.adventure.cities.definition(cityId)?.activationNpcIds ??
            []
        const absent = ids.filter((id) => !environment.characters.has(id))
        for (const entry of createSupportNpcs(
            environment.navigation,
            environment.companions,
            { onlyIds: absent }
        )) {
            if (!registerRoomCharacter(entry, environment, cityId)) {
                continue
            }
            initializeNpcSpeechProfiles(
                [entry.character],
                environment.speechSeed
            )
            initializeNpcIdentityProfiles(
                [entry.character],
                environment.identitySeed
            )
            seedNpcPockets([entry.character])
        }
        environment.onRegistered?.()
    })
}
