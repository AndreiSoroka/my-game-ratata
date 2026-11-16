import type {
    CharacterArchetype,
    CharacterControllerKind,
    ControlSource,
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
    const controlSource = options.soul?.controlSource ?? defaults.controlSource
    return {
        kind: controlSource === 'script' ? 'echo' : 'spark',
        controlSource,
        canSpeak: options.soul?.canSpeak ?? defaults.canSpeak,
        personality: options.soul?.personality ?? defaults.personality,
        companion: null,
    }
}

function defaultSoul(options: SoulOptions): SoulProfile {
    const humanControlled = options.controllerKind === 'network_player'
    const person = options.archetype === 'human'
    return {
        kind: humanControlled ? 'spark' : 'echo',
        controlSource: humanControlled ? 'human' : 'script',
        canSpeak: person,
        personality: person
            ? 'Самостоятельный путник.'
            : 'Живёт привычками и инстинктами.',
    }
}

export function setCharacterControlSource(
    character: { soul: SoulSnapshot },
    source: ControlSource
): void {
    character.soul.controlSource = source
    character.soul.kind = source === 'script' ? 'echo' : 'spark'
}
