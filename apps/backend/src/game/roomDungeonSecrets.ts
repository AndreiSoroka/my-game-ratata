import { createDungeonSkeletons } from './dungeonSkeletons'
import {
    type CharacterRegistrationEnvironment,
    registerRoomCharacter,
} from './roomCharacterRegistration'
import type { WorldLocations } from './worldLocations'

export function bindDungeonSecretGuards(
    world: WorldLocations,
    environment: CharacterRegistrationEnvironment & {
        now: () => number
        onRegistered: () => void
    }
): void {
    for (const {
        description,
        navigation,
        secrets,
    } of world.locations.values()) {
        if (secrets === undefined || description.biome !== 'dungeon') {
            continue
        }
        const { dungeonSize, id } = description
        if (dungeonSize === undefined) {
            throw new Error(`Missing dungeon size for ${id}`)
        }
        secrets.spawnGuards = (secretId, positions) => {
            const guards = createDungeonSkeletons(
                navigation,
                dungeonSize,
                positions,
                secretId
            )
            const now = environment.now()
            for (const guard of guards) {
                guard.character.lifeStartedAt = now
                guard.character.animationStartedAt = now
                registerRoomCharacter(guard, environment, id)
            }
            environment.onRegistered()
        }
    }
}
