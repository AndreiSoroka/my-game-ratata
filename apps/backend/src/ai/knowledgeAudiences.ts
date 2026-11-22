import {
    abilityIds,
    arcaneAbilityIds,
    archetypeCreatureTypes,
    CENTER_LOCATION_ID,
    creatureTypes,
    prayerAbilityIds,
    WORKSHOP_DEFINITIONS,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import { companionProfiles } from '../game/companionProfiles'
import { supportNpcHomeDefinitions } from '../game/supportNpcs'
import { workerHomeDefinitions } from '../game/workerSpawns'

export type KnowledgeAudienceClause = string | readonly string[]

const professions = [
    'lumberjack',
    'miner',
    'farmer',
    'smith',
    'weaver',
    'baker',
    'merchant',
    'guard',
] as const
const authoredHomes = new Map<string, string>([
    ...supportNpcHomeDefinitions().map(({ id }): [string, string] => [
        id,
        CENTER_LOCATION_ID,
    ]),
    ...workerHomeDefinitions().map(({ id, cityId }): [string, string] => [
        id,
        cityId,
    ]),
    ['npc_friendly_girl_1', CENTER_LOCATION_ID],
])
const characterIds = new Set([
    ...authoredHomes.keys(),
    ...Object.keys(companionProfiles),
])
const locationIds = new Set(WORLD_LOCATION_DEFINITIONS.map(({ id }) => id))
const residenceOverrides = new WeakMap<GameCharacter, readonly string[]>()
const workshopProfessions = new Map<string, string>([
    ['npc_smith_1', 'smith'],
    ['npc_weaver_1', 'weaver'],
    ['npc_baker_1', 'baker'],
])

/** Audience identifiers are authored data, not predicates supplied by a model. */
export function isKnowledgeAudience(value: string): boolean {
    if (value === 'common') {
        return true
    }
    const separator = value.indexOf(':')
    const kind = value.slice(0, separator)
    const name = value.slice(separator + 1)
    switch (kind) {
        case 'creature':
            return creatureTypes.some((type) => type === name)
        case 'archetype':
            return Object.hasOwn(archetypeCreatureTypes, name)
        case 'profession':
            return professions.some((profession) => profession === name)
        case 'doctrine':
            return name === 'prayer' || name === 'magic'
        case 'resident':
            return locationIds.has(name)
        case 'character':
            return characterIds.has(name)
        case 'knows':
            return abilityIds.some((id) => id === name)
        default:
            return false
    }
}

/** An explicit server-side residence change; travel and control leases never call it. */
export function setKnowledgeResidences(
    actor: GameCharacter,
    residences: readonly string[]
): void {
    if (residences.some((id) => !locationIds.has(id))) {
        throw new Error('Unknown knowledge residence')
    }
    residenceOverrides.set(actor, Object.freeze([...new Set(residences)]))
}

export function knowledgeResidenceIds(actor: GameCharacter): readonly string[] {
    const override = residenceOverrides.get(actor)
    if (override !== undefined) {
        return override
    }
    const residences = new Set<string>()
    const authoredHome = authoredHomes.get(actor.id)
    if (authoredHome !== undefined) {
        residences.add(authoredHome)
    }
    for (const location of locationIds) {
        if (
            actor.tags.has(`resident.${location}`) ||
            actor.tags.has(`worker.city.${location}`)
        ) {
            residences.add(location)
        }
    }
    return [...residences]
}

/** Knowledge is independent from equipment, appearance, Spark and controller ownership. */
export function characterKnowledgeAudiences(actor: GameCharacter): Set<string> {
    const audiences = new Set([
        'common',
        `creature:${actor.creatureType}`,
        `archetype:${actor.archetype}`,
        `character:${actor.id}`,
    ])
    for (const location of knowledgeResidenceIds(actor)) {
        audiences.add(`resident:${location}`)
    }
    for (const profession of professions) {
        if (actor.tags.has(`worker.${profession}`)) {
            audiences.add(`profession:${profession}`)
        }
    }
    const workshop = WORKSHOP_DEFINITIONS.find(
        ({ npcId }) => npcId === actor.id
    )
    const workshopProfession = workshopProfessions.get(actor.id)
    if (workshop !== undefined && workshopProfession !== undefined) {
        audiences.add(`profession:${workshopProfession}`)
    }
    if (actor.id === 'npc_merchant_1') {
        audiences.add('profession:merchant')
    }
    if (actor.tags.has('guard')) {
        audiences.add('profession:guard')
    }
    addDoctrineAudiences(actor, audiences)
    for (const ability of actor.abilities.known) {
        audiences.add(`knows:${ability}`)
    }
    return audiences
}

function addDoctrineAudiences(
    actor: GameCharacter,
    audiences: Set<string>
): void {
    if (
        actor.tags.has('cleric') ||
        prayerAbilityIds.some((id) => actor.abilities.known.has(id))
    ) {
        audiences.add('doctrine:prayer')
    }
    if (
        actor.tags.has('scholar') ||
        arcaneAbilityIds.some((id) => actor.abilities.known.has(id))
    ) {
        audiences.add('doctrine:magic')
    }
}

export function hasKnowledgeAudience(
    audiences: ReadonlySet<string>,
    clauses: readonly KnowledgeAudienceClause[]
): boolean {
    return clauses.some((clause) =>
        typeof clause === 'string'
            ? audiences.has(clause)
            : clause.length > 0 && clause.every((atom) => audiences.has(atom))
    )
}
