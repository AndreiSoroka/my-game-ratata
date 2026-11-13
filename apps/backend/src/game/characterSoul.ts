import type {
    CharacterArchetype,
    CharacterControllerKind,
    SoulProfile,
    SoulSnapshot,
} from '@my-game-ratata/contracts'

interface SoulOptions {
    archetype: CharacterArchetype
    controllerKind: CharacterControllerKind
    soul?: Partial<SoulProfile>
}

export function createCharacterSoul(options: SoulOptions): SoulSnapshot {
    const defaults = defaultSoul(options)
    return {
        kind: options.soul?.kind ?? defaults.kind,
        controlSource: options.soul?.controlSource ?? defaults.controlSource,
        canSpeak: options.soul?.canSpeak ?? defaults.canSpeak,
        personality: options.soul?.personality ?? defaults.personality,
        companion: null,
    }
}

function defaultSoul(options: SoulOptions): SoulProfile {
    const humanControlled = options.controllerKind === 'network_player'
    const person = options.archetype === 'human'
    return {
        kind: humanControlled || person ? 'spark' : 'echo',
        controlSource: humanControlled ? 'human' : 'script',
        canSpeak: person,
        personality: person
            ? 'Самостоятельный путник.'
            : 'Живёт привычками и инстинктами.',
    }
}
