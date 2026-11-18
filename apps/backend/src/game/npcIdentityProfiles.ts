import { createHash, randomUUID } from 'node:crypto'

import type { GameCharacter } from './character'
import {
    type NpcBackstory,
    type NpcGender,
    type NpcIdentityDefinition,
    npcIdentityDefinitions,
    type NpcIdentityKey,
    type NpcSelfReference,
    type NpcSpeechHabits,
} from './npcIdentityCatalog'

export const NPC_IDENTITY_GENERATION_VERSION = 1

export interface NpcIdentityProfile {
    readonly version: typeof NPC_IDENTITY_GENERATION_VERSION
    readonly key: NpcIdentityKey
    readonly name: string
    readonly gender: NpcGender
    readonly selfReference: NpcSelfReference
    readonly speechHabits?: NpcSpeechHabits
    readonly description: string
    readonly responsibilities: readonly string[]
    readonly backstory: NpcBackstory
}

export function resolveNpcIdentitySeed(seed?: string): string {
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
            'NPC identity seed must be a non-empty string of at most 256 characters'
        )
    }
    return seed
}

export function validateNpcIdentityDefinition(
    definition: NpcIdentityDefinition
): void {
    if (
        !Object.hasOwn(npcIdentityDefinitions, definition.key) ||
        !nonempty(definition.name) ||
        !nonempty(definition.description) ||
        !['female', 'male', 'sexless'].includes(definition.gender) ||
        !['feminine', 'masculine', 'neuter'].includes(
            definition.selfReference
        ) ||
        definition.responsibilities.length === 0 ||
        !definition.responsibilities.every(nonempty) ||
        definition.backstories.length === 0
    ) {
        throw new Error('Invalid NPC identity definition')
    }
    const ids = new Set<string>()
    validateSpeechHabits(definition.speechHabits)
    for (const story of definition.backstories) {
        validateBackstory(story)
        if (ids.has(story.id)) {
            throw new Error('Invalid NPC identity backstory')
        }
        ids.add(story.id)
    }
}

function validateSpeechHabits(habits?: NpcSpeechHabits): void {
    if (habits === undefined) {
        return
    }
    if (habits.guidance.length === 0 || !habits.guidance.every(nonempty)) {
        throw new Error('Invalid NPC speech habits')
    }
    const interjection = habits.interjection
    if (
        interjection !== undefined &&
        (interjection.variants.length === 0 ||
            !interjection.variants.every(nonempty) ||
            new Set(interjection.variants).size !==
                interjection.variants.length ||
            interjection.positions.length === 0 ||
            new Set(interjection.positions).size !==
                interjection.positions.length ||
            !interjection.positions.every((position) =>
                ['start', 'middle', 'end'].includes(position)
            ))
    ) {
        throw new Error('Invalid NPC interjection habit')
    }
}

function freezeSpeechHabits(habits: NpcSpeechHabits): NpcSpeechHabits {
    return Object.freeze({
        guidance: Object.freeze([...habits.guidance]),
        ...(habits.interjection === undefined
            ? {}
            : {
                  interjection: Object.freeze({
                      variants: Object.freeze([
                          ...habits.interjection.variants,
                      ]),
                      positions: Object.freeze([
                          ...habits.interjection.positions,
                      ]),
                  }),
              }),
    })
}

function validateBackstory(story: NpcBackstory): void {
    const sentences = story.text.match(/[^.!?]+[.!?](?:\s|$)/gu) ?? []
    if (
        !/^[a-z][a-z0-9_]*$/u.test(story.id) ||
        !nonempty(story.title) ||
        !nonempty(story.text) ||
        story.text.length > 450 ||
        sentences.length < 2 ||
        sentences.length > 3
    ) {
        throw new Error('Invalid NPC identity backstory')
    }
}

function nonempty(value: string): boolean {
    return value.trim().length > 0
}

/** Authored spawn data chooses a profile; names, Spark and controllers cannot grant one. */
export function bindNpcIdentityKey(
    actor: GameCharacter,
    key?: NpcIdentityKey
): void {
    if (key === undefined || actor.controllerKind === 'network_player') {
        return
    }
    if (!Object.hasOwn(npcIdentityDefinitions, key)) {
        throw new Error('Unknown NPC identity key')
    }
    Object.defineProperty(actor, 'npcIdentityKey', {
        value: key,
        writable: false,
        configurable: false,
        enumerable: false,
    })
}

/** Independent hash domain: does not consume or depend on gameplay or speech RNG. */
export function generateNpcIdentityProfile(
    seed: string,
    actorId: string,
    key: NpcIdentityKey,
    definition: NpcIdentityDefinition = npcIdentityDefinitions[key]
): NpcIdentityProfile {
    resolveNpcIdentitySeed(seed)
    if (actorId.trim().length === 0 || definition.key !== key) {
        throw new Error(
            'NPC identity selection requires a stable identity and matching profile'
        )
    }
    validateNpcIdentityDefinition(definition)
    const options = [...definition.backstories].sort((a, b) =>
        a.id.localeCompare(b.id, 'en')
    )
    const digest = createHash('sha256')
        .update(
            JSON.stringify([
                'npc-identity',
                NPC_IDENTITY_GENERATION_VERSION,
                seed,
                actorId,
                key,
            ])
        )
        .digest()
    const selected = options[digest.readUInt32BE(0) % options.length]
    if (selected === undefined) {
        throw new Error('NPC identity selection has no candidates')
    }
    return Object.freeze({
        version: NPC_IDENTITY_GENERATION_VERSION,
        key,
        name: definition.name,
        gender: definition.gender,
        selfReference: definition.selfReference,
        ...(definition.speechHabits === undefined
            ? {}
            : {
                  speechHabits: freezeSpeechHabits(definition.speechHabits),
              }),
        description: definition.description,
        responsibilities: Object.freeze([...definition.responsibilities]),
        backstory: Object.freeze({ ...selected }),
    })
}

/** Exactly once for an authored non-human-owned living identity, even while it is an Echo. */
export function initializeNpcIdentityProfiles(
    characters: Iterable<GameCharacter>,
    seed: string
): void {
    resolveNpcIdentitySeed(seed)
    Object.values(npcIdentityDefinitions).forEach(validateNpcIdentityDefinition)
    for (const actor of characters) {
        if (
            actor.controllerKind === 'network_player' ||
            !actor.soul.canSpeak ||
            actor.npcIdentityKey === undefined ||
            actor.npcIdentityProfile !== undefined
        ) {
            continue
        }
        Object.defineProperty(actor, 'npcIdentityProfile', {
            value: generateNpcIdentityProfile(
                seed,
                actor.id,
                actor.npcIdentityKey
            ),
            writable: false,
            configurable: false,
            enumerable: false,
        })
    }
}
