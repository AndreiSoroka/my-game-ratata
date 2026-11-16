import {
    ABILITY_DEFINITIONS,
    type AbilityId,
    type CharacterSheetSnapshot,
    type ObservedAttack,
    type ObservedResource,
    type ObservedValue,
} from '@my-game-ratata/contracts'

import { knowsAbility } from './abilityState'
import type { GameCharacter } from './character'
import { hasStar } from './constellations'
import {
    effectiveAbility,
    effectiveCharacterStats,
} from './effectiveParameters'
import { effectiveMaxMana } from './effectiveResources'

/** Range bounds are observations, never additional copies of the hidden value. */
export function observeValue(
    value: number,
    step: number | null
): ObservedValue {
    const safe = Math.max(0, value)
    if (step === null) {
        return { kind: 'exact', value: safe }
    }
    const bucket = Math.floor(
        (safe + Number.EPSILON * Math.max(1, safe)) / step
    )
    return {
        kind: 'range',
        lower: Number((bucket * step).toPrecision(12)),
        upper: Number(((bucket + 1) * step).toPrecision(12)),
    }
}

function knowledgeStep(
    actor: GameCharacter,
    prefix: string,
    steps: ReadonlyArray<number | null>
) {
    if (actor.exactCombatNumbers) {
        return null
    }
    let step = steps[0] ?? null
    for (let rank = 1; rank < steps.length; rank += 1) {
        if (hasStar(actor, `${prefix}${String(rank)}`)) {
            step = steps[rank] ?? null
        }
    }
    return step
}

function resource(
    current: number,
    max: number,
    step: number | null
): ObservedResource {
    return {
        current: observeValue(current, max > 0 ? step : null),
        max: observeValue(max, max > 0 ? step : null),
        hasCapacity: max > 0,
    }
}

function attackKnowledge(actor: GameCharacter, id: AbilityId | 'basic_attack') {
    if (id === 'basic_attack') {
        return knowledgeStep(actor, 'blade.insight', [5, 2, null])
    }
    if (id === 'shot') {
        return knowledgeStep(actor, 'arrow.insight', [5, 2, null])
    }
    return actor.exactCombatNumbers || hasStar(actor, 'magic.insight')
        ? null
        : 5
}

function attackSource(actor: GameCharacter, id: AbilityId | 'basic_attack') {
    const stats = effectiveCharacterStats(actor)
    if (id === 'basic_attack') {
        return {
            name: 'Удар оружием',
            low: stats.minDamage,
            high: stats.maxDamage,
            cooldownMs: stats.attackCooldownMs,
            critChance: stats.critChance,
        }
    }
    const ability = effectiveAbility(actor, id)
    const critBonus =
        id === 'shot' && hasStar(actor, 'arrow.critical') ? 0.03 : 0
    return {
        name: ABILITY_DEFINITIONS[id].name,
        low: Math.round(ability.damage ?? stats.minDamage),
        high: Math.round(
            ability.maxDamage ?? ability.damage ?? stats.maxDamage
        ),
        cooldownMs: ability.cooldownMs,
        critChance:
            id === 'fireball' || id === 'greater_fireball'
                ? 0
                : Math.min(0.95, actor.config.combat.critChance + critBonus),
    }
}

function observeAttack(
    actor: GameCharacter,
    id: AbilityId | 'basic_attack'
): ObservedAttack {
    const source = attackSource(actor, id)
    const step = attackKnowledge(actor, id)
    const timeStep = step === null ? null : step === 2 ? 100 : 500
    const chanceStep = step === null ? null : step === 2 ? 0.02 : 0.05
    return {
        id,
        name: source.name,
        damage: {
            min: observeValue(source.low, step),
            max: observeValue(source.high, step),
        },
        cooldownMs: observeValue(source.cooldownMs, timeStep),
        critChance: observeValue(source.critChance, chanceStep),
    }
}

function bodyKnowledge(actor: GameCharacter) {
    const rank =
        [4, 3, 2, 1].find((value) =>
            hasStar(actor, `life.hp${String(value)}`)
        ) ?? 0
    const moveSteps = [1, 0.5, 0.25, 0.125, null]
    const dodgeSteps = [0.05, 0.02, 0.01, 0.005, null]
    return {
        movement: actor.exactCombatNumbers ? null : (moveSteps[rank] ?? null),
        dodge: actor.exactCombatNumbers ? null : (dodgeSteps[rank] ?? null),
    }
}

export function createCharacterSheet(
    actor: GameCharacter,
    tileWidth: number
): CharacterSheetSnapshot {
    const stats = effectiveCharacterStats(actor)
    const body = bodyKnowledge(actor)
    const ids = [
        'spark',
        'shot',
        'skeleton_strike',
        'fireball',
        'greater_fireball',
    ] as const
    return {
        health: resource(
            actor.hp,
            actor.maxHp,
            knowledgeStep(actor, 'life.hp', [50, 25, 10, 5, null])
        ),
        mana: resource(
            actor.mana,
            effectiveMaxMana(actor),
            knowledgeStep(actor, 'magic.mana', [50, 25, 10, null])
        ),
        energy: resource(
            actor.energy,
            actor.config.resources.maxEnergy,
            knowledgeStep(actor, 'life.energy', [50, 25, 10, null])
        ),
        moveSpeed: observeValue(stats.moveSpeed / tileWidth, body.movement),
        dodgeChance: observeValue(stats.dodgeChance, body.dodge),
        attacks: [
            observeAttack(actor, 'basic_attack'),
            ...ids
                .filter((id) => knowsAbility(actor, id))
                .map((id) => observeAttack(actor, id)),
        ],
    }
}
