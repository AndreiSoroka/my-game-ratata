import {
    bladeAbilityIds,
    type ConstellationId,
    type GameEventPayload,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { type ConstellationStar } from './constellationCatalog'
import { fullConstellationCatalog } from './constellationNodes'
import {
    canDiscoverConstellationStar,
    minimumConstellationLevel,
    starterConstellationStars,
} from './constellationRequirements'
import { syncMagicConstellation } from './magicProgression'
import { captureMasteryLevels } from './skillProgression'

export { constellationModifiers } from './constellationModifiers'
export { snapshotConstellations } from './constellationSnapshot'
export { createConstellationState } from './constellationState'

export function hasStar(actor: GameCharacter, id: string): boolean {
    return actor.progression.constellations.opened.has(id)
}

export function initializeConstellations(actor: GameCharacter): void {
    for (const id of starterConstellationStars(actor.heroClass)) {
        actor.progression.constellations.opened.add(id)
    }
    syncAbilityConstellations(actor)
}

export function syncAbilityConstellations(actor: GameCharacter): void {
    const known = actor.abilities.known
    syncBladeAbilities(actor)
    if (hasStar(actor, 'prayer.area')) {
        known.add('pray_woven')
    }
    for (const [ability, path] of [
        ['pray', 'prayer'],
        ['pray_road', 'prayer_road'],
        ['pray_lantern', 'prayer_lantern'],
        ['pray_grave', 'prayer_grave'],
        ['shot', 'arrow'],
    ] as const) {
        if (known.has(ability)) {
            actor.progression.constellations.opened.add(`${path}.root`)
        }
    }
    syncMagicConstellation(actor)
    if (hasStar(actor, 'arrow.sniper_shot')) {
        known.add('sniper_shot')
    }
    if (
        hasStar(actor, 'arrow.root') &&
        actor.progression.masteries.arrow.level >=
            minimumConstellationLevel('arrow.moving_shot')
    ) {
        actor.progression.constellations.opened.add('arrow.moving_shot')
    }
    for (const [ability, path] of [
        ['pray', 'prayer'],
        ['pray_grave', 'prayer_grave'],
    ] as const) {
        if (
            known.has(ability) &&
            (actor.heroClass === 'cleric' ||
                actor.progression.masteries[path].level >= 5)
        ) {
            actor.progression.constellations.opened.add(`${path}.revive`)
        }
    }
}

function syncBladeAbilities(actor: GameCharacter): void {
    const known = actor.abilities.known
    for (const id of bladeAbilityIds) {
        if (hasStar(actor, `blade.${id}`)) {
            known.add(id)
        }
    }
}

export interface ConstellationAction {
    constellationIds?: readonly ConstellationId[]
    now: number
    random?: (() => number) | undefined
    actionId?: string | undefined
    evidence?: string[] | undefined
}

/** Call once after resolving all effects and practice of a meaningful action. */
export function finishConstellationAction(
    actor: GameCharacter,
    action: ConstellationAction
): GameEventPayload[] {
    if (!canResolveDiscoveries(actor)) {
        return []
    }
    const state = actor.progression.constellations
    if (!acceptActionReceipt(actor, action.actionId)) {
        return []
    }
    for (const signal of action.evidence ?? []) {
        state.evidence[signal] = (state.evidence[signal] ?? 0) + 1
    }
    discoverLastLight(actor, action)
    discoverLifeBreath(actor)
    syncAbilityConstellations(actor)
    const requirementContext = {
        opened: state.opened,
        levels: captureMasteryLevels(actor),
        knownAbilities: actor.abilities.known,
        ...(actor.heroClass === undefined
            ? {}
            : { heroClass: actor.heroClass }),
    }
    let remaining = fullConstellationCatalog.length
    while (remaining > 0) {
        remaining -= 1
        const candidates = fullConstellationCatalog.filter(
            (node) =>
                state.credits[node.constellationId] > 0 &&
                canDiscoverConstellationStar(node, requirementContext)
        )
        if (candidates.length === 0) {
            break
        }
        const node = chooseStar(actor, candidates, action.random ?? Math.random)
        state.opened.add(node.id)
        if (node.id === 'life.energy2') {
            discoverLifeBreath(actor)
        }
        state.credits[node.constellationId] -= 1
        state.evidence = Object.fromEntries(
            Object.entries(state.evidence).filter(
                ([key]) => evidencePath(key) !== node.constellationId
            )
        )
    }
    discoverLastLight(actor, action)
    syncAbilityConstellations(actor)
    return []
}

function canResolveDiscoveries(actor: GameCharacter): boolean {
    return (
        actor.alive &&
        actor.trainingTarget === undefined &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired')
    )
}

export function discoverLifeBreath(actor: GameCharacter): boolean {
    const state = actor.progression.constellations
    const baseEnergy = actor.config.resources.maxEnergy
    if (
        state.opened.has('life.breath') ||
        !state.opened.has('life.energy2') ||
        baseEnergy <= 0 ||
        state.lifeEnergy.recovered + 1e-9 < 3 * baseEnergy ||
        !canResolveDiscoveries(actor)
    ) {
        return false
    }
    state.opened.add('life.breath')
    return true
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
    if (key === 'wound' || key === 'recovery' || key === 'work_recovery') {
        return 'life'
    }
    if (key === 'barrier') {
        return 'magic'
    }
    return (
        {
            swordsmanship: 'blade',
            arcana: 'magic',
            fireball: 'magic',
            greater_fireball: 'magic',
            chains: 'magic',
            marksmanship: 'arrow',
            quick_shot: 'arrow',
            sniper_shot: 'arrow',
            moving_shot: 'arrow',
            vitality: 'life',
            stealth: 'shadow',
            theft: 'shadow',
            prayer: 'prayer',
            blade: 'blade',
            magic: 'magic',
            arrow: 'arrow',
            life: 'life',
            shadow: 'shadow',
            prayer_road: 'prayer_road',
            prayer_lantern: 'prayer_lantern',
            prayer_grave: 'prayer_grave',
        } as Record<string, ConstellationId>
    )[key]
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
): void {
    if (
        hasStar(actor, 'prayer.last_light') ||
        !hasStar(actor, 'prayer.gift1') ||
        !hasStar(actor, 'life.hp1') ||
        action.evidence?.includes('low_hp_gift') !== true
    ) {
        return
    }
    actor.progression.constellations.opened.add('prayer.last_light')
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
    return []
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
