import type {
    CharacterArchetype,
    CharacterControllerKind,
    CompanionOrder,
    CompanionWaitMode,
    ControlSource,
    SoulSnapshot,
} from '@my-game-ratata/contracts'

export interface SoulProfile extends SoulSnapshot {
    personality: string
}

export interface CharacterSoul extends SoulProfile {
    companion: {
        canFight: boolean
        lastReply: string | null
        leaderId: string | null
        order: CompanionOrder
        waitMode?: CompanionWaitMode
        controlRevision?: number
    } | null
}

interface SoulOptions {
    archetype: CharacterArchetype
    controllerKind: CharacterControllerKind
    soul?: Partial<SoulProfile>
}

export function createCharacterSoul(options: SoulOptions): CharacterSoul {
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
    character: { soul: CharacterSoul },
    source: ControlSource
): void {
    character.soul.controlSource = source
    character.soul.kind = source === 'script' ? 'echo' : 'spark'
}
