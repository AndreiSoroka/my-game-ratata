import type {
    CharacterArchetype,
    CharacterControllerKind,
    CharacterFactionId,
    CharacterReputation,
    CharacterVisualId,
    CreatureType,
    HeroClass,
    Vector2,
} from '@my-game-ratata/contracts'
import {
    archetypeCreatureTypes,
    isCreatureType,
} from '@my-game-ratata/contracts'

import type { SoulProfile } from './characterSoul'
import type { NpcIdentityKey } from './npcIdentityCatalog'

export interface GameCharacterOptions {
    ashPact?: boolean
    npcIdentityKey?: NpcIdentityKey | undefined
    trainingTarget?: { areaId: string }
    respawnPolicy?: 'automatic' | 'none'
    revivable?: boolean
    creatureType?: CreatureType
    archetype: CharacterArchetype
    heroClass?: HeroClass
    soul?: Partial<SoulProfile>
    mortal?: boolean
    controllerKind: CharacterControllerKind
    faction?: CharacterFactionId
    id: string
    nickname: string
    reputation?: CharacterReputation
    spawnPosition: Vector2
    spawnedAt?: number
    visualId?: CharacterVisualId
    locationId?: string
}

export function defaultFactionFor(
    controllerKind: CharacterControllerKind
): CharacterFactionId {
    return controllerKind === 'network_player' ? 'peaceful' : 'monsters'
}

export function resolveCreatureType(
    options: GameCharacterOptions
): CreatureType {
    const type =
        options.creatureType ?? archetypeCreatureTypes[options.archetype]
    if (!isCreatureType(type)) {
        throw new Error('Unknown creature type')
    }
    return type
}

export function createCharacterReputation(
    reputation: CharacterReputation | undefined
): CharacterReputation {
    return { monsters: -100, ...reputation }
}

export function defaultVisualIdFor(
    archetype: CharacterArchetype
): CharacterVisualId {
    return archetype === 'human' ? 'player' : archetype
}
