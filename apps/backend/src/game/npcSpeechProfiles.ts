import { createHash, randomUUID } from 'node:crypto'

import type { GameCharacter } from './character'
import {
    compatibleNpcSpeechTraits,
    type NpcSpeechToneId,
    npcSpeechToneIds,
    type NpcSpeechTraitId,
    npcSpeechTraitIds,
} from './npcSpeechCatalog'

export const NPC_SPEECH_GENERATION_VERSION = 1

export interface NpcSpeechProfile {
    readonly version: typeof NPC_SPEECH_GENERATION_VERSION
    readonly traits: readonly NpcSpeechTraitId[]
    readonly tone: NpcSpeechToneId
}

export interface NpcSpeechPool {
    readonly traits: readonly NpcSpeechTraitId[]
    readonly tones: readonly NpcSpeechToneId[]
    readonly minTraits: number
    readonly maxTraits: number
}

export const defaultNpcSpeechPool: NpcSpeechPool = {
    traits: ['kind', 'direct', 'reserved'],
    tones: ['conversational', 'business'],
    minTraits: 1,
    maxTraits: 3,
}

const authoredNpcSpeechPools: Readonly<Record<string, NpcSpeechPool>> = {
    npc_magic_slime_1: {
        traits: ['kind', 'cheerful'],
        tones: ['conversational', 'gentle'],
        minTraits: 1,
        maxTraits: 2,
    },
    npc_friendly_girl_1: {
        traits: npcSpeechTraitIds,
        tones: npcSpeechToneIds,
        minTraits: 1,
        maxTraits: 3,
    },
    npc_cleric_1: {
        traits: ['kind', 'reserved', 'pedant'],
        tones: ['gentle', 'business'],
        minTraits: 1,
        maxTraits: 3,
    },
}

export function npcSpeechPool(actorId: string): NpcSpeechPool {
    return authoredNpcSpeechPools[actorId] ?? defaultNpcSpeechPool
}

export function validateNpcSpeechPool(pool: NpcSpeechPool): void {
    if (
        !validChoices(pool.traits, npcSpeechTraitIds) ||
        !validChoices(pool.tones, npcSpeechToneIds) ||
        !Number.isInteger(pool.minTraits) ||
        !Number.isInteger(pool.maxTraits) ||
        pool.minTraits < 1 ||
        pool.maxTraits > 3 ||
        pool.minTraits > pool.maxTraits ||
        combinations(pool.traits, pool.maxTraits).length === 0
    ) {
        throw new Error('Invalid NPC speech pool')
    }
}

function validChoices(
    values: readonly string[],
    allowed: readonly string[]
): boolean {
    return (
        Array.isArray(values) &&
        values.length > 0 &&
        new Set(values).size === values.length &&
        values.every(
            (value: unknown) =>
                typeof value === 'string' && allowed.includes(value)
        )
    )
}

export function resolveNpcSpeechSeed(seed?: string): string {
    if (seed === undefined) {
        return randomUUID()
    }
    if (
        typeof seed !== 'string' ||
        seed.trim().length === 0 ||
        seed.length > 256 ||
        seed.includes('\0')
    ) {
        throw new Error(
            'NPC speech seed must be a non-empty string of at most 256 characters'
        )
    }
    return seed
}

/** Selection has its own deterministic stream and never consumes map or gameplay RNG. */
export function generateNpcSpeechProfile(
    seed: string,
    actorId: string,
    pool: NpcSpeechPool = npcSpeechPool(actorId)
): NpcSpeechProfile {
    resolveNpcSpeechSeed(seed)
    if (actorId.trim().length === 0) {
        throw new Error('NPC speech selection requires a stable character ID')
    }
    validateNpcSpeechPool(pool)
    let sequence = 0
    const pick = <T>(entries: readonly T[]): T => {
        const digest = createHash('sha256')
            .update(
                JSON.stringify([
                    'npc-speech',
                    NPC_SPEECH_GENERATION_VERSION,
                    seed,
                    actorId,
                    sequence++,
                ])
            )
            .digest()
        const entry = entries[digest.readUInt32BE(0) % entries.length]
        if (entry === undefined) {
            throw new Error('NPC speech selection has no valid candidates')
        }
        return entry
    }
    const counts = Array.from(
        { length: pool.maxTraits - pool.minTraits + 1 },
        (_, index) => pool.minTraits + index
    )
    const traits = pick(combinations(pool.traits, pick(counts)))
    return Object.freeze({
        version: NPC_SPEECH_GENERATION_VERSION,
        traits: Object.freeze([...traits]),
        tone: pick([...pool.tones].sort()),
    })
}

function combinations(
    source: readonly NpcSpeechTraitId[],
    count: number
): NpcSpeechTraitId[][] {
    const available = [...source].sort()
    const result: NpcSpeechTraitId[][] = []
    const visit = (selected: NpcSpeechTraitId[], start: number): void => {
        if (selected.length === count) {
            result.push(selected)
            return
        }
        for (let index = start; index < available.length; index += 1) {
            const trait = available[index]
            if (trait === undefined) {
                continue
            }
            const next = [...selected, trait]
            if (compatibleNpcSpeechTraits(next)) {
                visit(next, index + 1)
            }
        }
    }
    visit([], 0)
    return result
}

/** Once per living identity, independent of model configuration and controller leases. */
export function initializeNpcSpeechProfiles(
    characters: Iterable<GameCharacter>,
    seed: string
): void {
    resolveNpcSpeechSeed(seed)
    for (const actor of characters) {
        if (
            actor.controllerKind !== 'network_player' &&
            actor.soul.canSpeak &&
            actor.npcSpeechProfile === undefined
        ) {
            Object.defineProperty(actor, 'npcSpeechProfile', {
                value: generateNpcSpeechProfile(seed, actor.id),
                writable: false,
                configurable: false,
                enumerable: false,
            })
        }
    }
}
