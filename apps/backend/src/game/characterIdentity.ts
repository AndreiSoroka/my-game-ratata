import type {
    CharacterArchetype,
    CharacterControllerKind,
    CharacterFactionId,
    CharacterReputation,
    CharacterVisualId,
    CreatureType,
    HeroClass,
    SoulProfile,
    Vector2,
} from '@my-game-ratata/contracts'

export interface GameCharacterOptions {
    respawnPolicy?: 'automatic' | 'none'
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
    visualId?: CharacterVisualId
    locationId?: string
}

export function defaultFactionFor(
    controllerKind: CharacterControllerKind
): CharacterFactionId {
    return controllerKind === 'network_player' ? 'peaceful' : 'monsters'
}

export function defaultVisualIdFor(
    archetype: CharacterArchetype
): CharacterVisualId {
    if (archetype === 'skeleton' || archetype === 'slime') {
        return archetype
    }

    return 'player'
}
