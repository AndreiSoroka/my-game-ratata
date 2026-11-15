import type {
    ConstellationId,
    GameEventPayload,
    SkillId,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    type ConstellationStar,
    constellationStars,
} from './constellationCatalog'
import { skillConstellations } from './constellationState'

export { constellationModifiers } from './constellationModifiers'
export { snapshotConstellations } from './constellationSnapshot'
export { createConstellationState } from './constellationState'

export function hasStar(actor: GameCharacter, id: string): boolean {
    return actor.progression.constellations.opened.has(id)
}

export function initializeConstellations(actor: GameCharacter): void {
    const path = {
        vanguard: 'blade',
        arcanist: 'magic',
        cleric: 'prayer',
        ranger: 'arrow',
    }[actor.heroClass ?? 'vanguard']
    if (actor.heroClass !== undefined) {
        actor.progression.constellations.opened.add(`${path}.root`)
    }
    syncAbilityConstellations(actor)
}

export function syncAbilityConstellations(actor: GameCharacter): void {
    const known = actor.abilities.known
    for (const [ability, path] of [
        ['pray', 'prayer'],
        ['shot', 'arrow'],
        ['spark', 'magic'],
        ['barrier', 'magic'],
    ] as const) {
        if (known.has(ability)) {
            actor.progression.constellations.opened.add(`${path}.root`)
        }
    }
}

export function recordConstellationPractice(
    actor: GameCharacter,
    id: SkillId,
    levels: number
): void {
    const state = actor.progression.constellations
    const path = skillConstellations[id]
    state.credits[path] += levels
    state.evidence[id] = (state.evidence[id] ?? 0) + 1
    if (path === 'blade' || path === 'life' || path === 'shadow') {
        state.opened.add(`${path}.root`)
    }
    syncAbilityConstellations(actor)
}

export interface ConstellationAction {
    skillIds: readonly SkillId[]
    now: number
    random?: (() => number) | undefined
    actionId?: string
    evidence?: string[]
}

/** Call once after resolving all effects and practice of a meaningful action. */
export function finishConstellationAction(
    actor: GameCharacter,
    action: ConstellationAction
): GameEventPayload[] {
    if (
        !actor.alive ||
        actor.trainingTarget !== undefined ||
        actor.tags.has('offline') ||
        actor.tags.has('state.retired')
    ) {
        return []
    }
    const state = actor.progression.constellations
    if (!acceptActionReceipt(actor, action.actionId)) {
        return []
    }
    for (const signal of action.evidence ?? []) {
        state.evidence[signal] = (state.evidence[signal] ?? 0) + 1
    }
    const events = discoverLastLight(actor, action)
    const paths = new Set(action.skillIds.map((id) => skillConstellations[id]))
    const candidates = constellationStars.filter((node) =>
        eligible(actor, node, paths)
    )
    if (candidates.length === 0) {
        return events
    }
    const node = chooseStar(actor, candidates, action.random ?? Math.random)
    state.opened.add(node.id)
    state.credits[node.constellationId] -= 1
    state.evidence = Object.fromEntries(
        Object.entries(state.evidence).filter(
            ([key]) => evidencePath(key) !== node.constellationId
        )
    )
    return [...events, discoveryNotice(actor, node.name)]
}
function acceptActionReceipt(
    actor: GameCharacter,
    actionId: string | undefined
): boolean {
    if (actionId === undefined) {
        return true
    }
    const receipts = actor.progression.constellations.receipts
    if (receipts.has(actionId)) {
        return false
    }
    receipts.add(actionId)
    return true
}

function evidencePath(key: string): ConstellationId | undefined {
    if (
        key === 'gift' ||
        key === 'harm' ||
        key === 'purify' ||
        key === 'prayer'
    ) {
        return 'prayer'
    }
    if (key === 'wound' || key === 'recovery') {
        return 'life'
    }
    if (key === 'barrier') {
        return 'magic'
    }
    return skillConstellations[key as SkillId]
}

function eligible(
    actor: GameCharacter,
    node: ConstellationStar,
    paths: Set<ConstellationId>
): boolean {
    return (
        paths.has(node.constellationId) &&
        actor.progression.constellations.credits[node.constellationId] > 0 &&
        !hasStar(actor, node.id) &&
        node.parents.every((id) => hasStar(actor, id)) &&
        (node.ability === undefined || knownAbility(actor, node.ability))
    )
}

function knownAbility(
    actor: GameCharacter,
    id: NonNullable<ConstellationStar['ability']>
): boolean {
    return id === 'fireball' || id === 'greater_fireball'
        ? actor.progression.skills[id].unlocked
        : actor.abilities.known.has(id)
}

function chooseStar(
    actor: GameCharacter,
    nodes: ConstellationStar[],
    random: () => number
): ConstellationStar {
    const weights = nodes.map(
        (node) =>
            1 +
            Math.min(
                5,
                node.evidence.reduce(
                    (sum, key) =>
                        sum +
                        (actor.progression.constellations.evidence[key] ?? 0),
                    0
                )
            )
    )
    let roll =
        Math.max(0, Math.min(0.999999999, random())) *
        weights.reduce((sum, value) => sum + value, 0)
    for (const [index, node] of nodes.entries()) {
        roll -= weights[index] ?? 1
        if (roll < 0) {
            return node
        }
    }
    const first = nodes[0]
    if (first === undefined) {
        throw new Error('Cannot choose from an empty constellation frontier')
    }
    return first
}

function discoverLastLight(
    actor: GameCharacter,
    action: ConstellationAction
): GameEventPayload[] {
    if (
        hasStar(actor, 'prayer.last_light') ||
        !hasStar(actor, 'prayer.gift1') ||
        !hasStar(actor, 'life.hp1') ||
        action.evidence?.includes('low_hp_gift') !== true
    ) {
        return []
    }
    actor.progression.constellations.opened.add('prayer.last_light')
    return [discoveryNotice(actor, 'Последний огонёк')]
}

export function recordRunicContact(
    actor: GameCharacter,
    targetId: string,
    kind: 'spell' | 'shot',
    now: number
): GameEventPayload[] {
    const state = actor.progression.constellations
    if (
        !hasStar(actor, 'magic.spark_damage') ||
        !hasStar(actor, 'arrow.damage1')
    ) {
        return []
    }
    if (kind === 'spell') {
        state.lastSpellHit = { targetId, at: now }
        if (hasStar(actor, 'magic.runic_echo')) {
            state.runicShotUntil = now + 5000
        }
        return []
    }
    const previous = state.lastSpellHit
    if (
        hasStar(actor, 'magic.runic_echo') ||
        previous?.targetId !== targetId ||
        now - previous.at > 5000
    ) {
        return []
    }
    state.opened.add('magic.runic_echo')
    return [discoveryNotice(actor, 'Руническое эхо')]
}

export function consumeRunicShot(actor: GameCharacter, now: number): number {
    const state = actor.progression.constellations
    const multiplier =
        state.runicShotUntil > now && hasStar(actor, 'magic.runic_echo')
            ? 1.1
            : 1
    state.runicShotUntil = 0
    return multiplier
}

function discoveryNotice(actor: GameCharacter, name: string): GameEventPayload {
    return {
        kind: 'notice',
        actorId: actor.id,
        audienceIds: [actor.id],
        text: `Открыта звезда: ${name}.`,
    }
}
