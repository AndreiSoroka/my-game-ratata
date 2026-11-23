import { createHash } from 'node:crypto'

import type { CharacterArchetype } from '@my-game-ratata/contracts'

const traitNames = [
    'temper',
    'selfControl',
    'aggression',
    'courage',
    'kindness',
    'lawfulness',
    'resentment',
    'newsSharing',
    'credulity',
] as const

type TraitName = (typeof traitNames)[number]
type TraitRange = readonly [minimum: number, maximum: number]
type TraitRanges = Readonly<Partial<Record<TraitName, TraitRange>>>
export type CharacterTraits = Readonly<Record<TraitName, number>>

const ordinary: TraitRange = [30, 70]
const guardedWorker: TraitRanges = {
    courage: [25, 50],
    aggression: [15, 44],
    lawfulness: [58, 80],
}

/** Authored ranges capture existing professions and character dispositions. */
const authoredRanges: Readonly<Record<string, TraitRanges>> = {
    npc_merchant_1: {
        temper: [18, 42],
        selfControl: [62, 86],
        aggression: [5, 23],
        courage: [14, 34],
        lawfulness: [80, 96],
        newsSharing: [38, 65],
        credulity: [15, 35],
    },
    npc_smith_1: {
        temper: [70, 90],
        selfControl: [42, 60],
        aggression: [55, 80],
        courage: [65, 85],
        lawfulness: [40, 65],
        newsSharing: [15, 36],
    },
    npc_tailor_1: {
        temper: [10, 30],
        selfControl: [70, 92],
        aggression: [0, 16],
        kindness: [60, 78],
        lawfulness: [60, 78],
    },
    npc_friendly_girl_1: {
        selfControl: [76, 91],
        aggression: [7, 25],
        kindness: [62, 82],
        lawfulness: [75, 94],
        newsSharing: [55, 75],
        credulity: [18, 38],
    },
    npc_princess_1: {
        selfControl: [64, 84],
        aggression: [18, 38],
        courage: [64, 86],
        kindness: [54, 75],
        credulity: [18, 40],
    },
    npc_veteran_1: {
        selfControl: [67, 83],
        aggression: [61, 82],
        courage: [80, 96],
        credulity: [9, 30],
    },
    npc_magic_slime_1: {
        temper: [15, 37],
        aggression: [0, 12],
        courage: [15, 34],
        kindness: [75, 96],
    },
    npc_cleric_1: {
        selfControl: [72, 90],
        aggression: [0, 11],
        kindness: [82, 98],
        resentment: [5, 22],
    },
    npc_guard_1: {
        selfControl: [65, 86],
        courage: [77, 96],
        lawfulness: [82, 99],
    },
    npc_herbalist_1: { kindness: [70, 91], aggression: [8, 24] },
    npc_baker_1: { kindness: [65, 86], newsSharing: [60, 82] },
    npc_cartographer_1: { courage: [24, 47], credulity: [15, 30] },
    npc_farmer_1: guardedWorker,
    npc_lumberjack_1: guardedWorker,
    npc_miner_1: guardedWorker,
}

const archetypeRanges: Readonly<
    Partial<Record<CharacterArchetype, TraitRanges>>
> = {
    slime: { aggression: [55, 81], kindness: [8, 32] },
    skeleton: {
        selfControl: [56, 83],
        aggression: [62, 86],
        courage: [72, 97],
        newsSharing: [0, 20],
    },
}

export function generateCharacterTraits(
    actorId: string,
    archetype: CharacterArchetype
): CharacterTraits {
    const authored = authoredRanges[actorId]
    const species = archetypeRanges[archetype]
    const traits = {} as Record<TraitName, number>
    for (const trait of traitNames) {
        const [min, max] = authored?.[trait] ?? species?.[trait] ?? ordinary
        const roll = temperamentRoll(['trait', actorId, trait])
        traits[trait] = min + Math.floor(roll * (max - min + 1))
    }
    return Object.freeze(traits)
}

/** This stable stream has no effect on combat, loot, or world generation. */
export function temperamentRoll(parts: ReadonlyArray<string | number>): number {
    return (
        createHash('sha256')
            .update(JSON.stringify(['character-temperament-v1', ...parts]))
            .digest()
            .readUInt32BE(0) / 0x1_0000_0000
    )
}
