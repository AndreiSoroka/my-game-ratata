import {
    ABILITY_DEFINITIONS,
    type AbilityClientMessage,
    type AbilityId,
    abilityIds,
    BARRIER_RULES,
    type GameEventPayload,
    type LearnAbilityId,
    type PrayerIntent,
    type WorldCombatTarget,
} from '@my-game-ratata/contracts'

import { type AbilityContext, abilityNotice } from './abilityContext'
import { knowsAbility } from './abilityState'
import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'
import {
    parseCombatReference,
    parseWorldCombatTarget,
} from './combatTargetParsing'
import { learnAbility } from './magicLearning'
import { pray } from './prayer'
import { cancelPrayerCast } from './prayerCancellation'
import { canPerformSkillAction } from './skillProgression'
import { castSpell } from './spellCasting'

export function parseAbilityCommand(
    record: Record<string, unknown>
): AbilityClientMessage | undefined {
    if (record['type'] === 'cancel_prayer') {
        return Object.keys(record).length === 1
            ? { type: 'cancel_prayer' }
            : undefined
    }
    const id = record['abilityId']
    if (typeof id !== 'string' || !abilityIds.includes(id as AbilityId)) {
        return undefined
    }
    const targetId = record['targetId']
    if (record['type'] === 'learn_ability') {
        if (
            !['pray', 'spark', 'barrier', 'shot'].includes(id) ||
            !validId(targetId)
        ) {
            return undefined
        }
        return {
            type: 'learn_ability',
            abilityId: id as LearnAbilityId,
            targetId,
        }
    }
    if (record['type'] !== 'use_ability') {
        return undefined
    }
    if (id === 'pray') {
        const intent = parsePrayerIntent(record['intent'])
        return intent === undefined
            ? undefined
            : { type: 'use_ability', abilityId: 'pray', intent }
    }
    const reference = parseCombatReference(record)
    if (reference === undefined) {
        return undefined
    }
    return {
        type: 'use_ability',
        abilityId: id as Exclude<AbilityId, 'pray'>,
        ...reference,
    }
}
export function handleAbilityCommand(
    actor: GameCharacter,
    message: AbilityClientMessage,
    context: AbilityContext
): GameEventPayload[] {
    if (message.type === 'cancel_prayer') {
        cancelCharacterControl(actor)
        return cancelPrayerCast(actor, context.now)
    }
    if (message.type === 'learn_ability') {
        return learnAbility(
            actor,
            context.characters.find(
                (candidate) => candidate.id === message.targetId
            ),
            message.abilityId,
            context
        )
    }
    const id = message.abilityId
    if (!knowsAbility(actor, id)) {
        return abilityNotice(actor, 'Способность ещё не изучена.')
    }
    if (!canPerformSkillAction(actor, context.now)) {
        return abilityNotice(actor, 'Персонаж не может действовать сейчас.')
    }
    if (context.now < (actor.abilities.availableAt[id] ?? 0)) {
        return abilityNotice(actor, 'Способность ещё восстанавливается.')
    }
    return executeAbility(actor, message, context)
}
function executeAbility(
    actor: GameCharacter,
    message: Extract<AbilityClientMessage, { type: 'use_ability' }>,
    context: AbilityContext
): GameEventPayload[] {
    const id = message.abilityId
    if (message.abilityId === 'pray') {
        return pray(actor, context.now, context.random, context, message.intent)
    }
    if (id === 'barrier') {
        return castBarrier(actor, context.now)
    }
    if (id === 'shot' || id === 'spark') {
        return executeAttackAbility(
            actor,
            message.targetId,
            id,
            context,
            message.target
        )
    }
    if (message.targetId === undefined && message.target === undefined) {
        return abilityNotice(actor, 'Сначала выберите цель.')
    }
    if (id === 'fireball' || id === 'greater_fireball') {
        const events = castSpell(
            actor,
            {
                type: 'cast_spell',
                skillId: id,
                ...(message.targetId === undefined
                    ? {}
                    : { targetId: message.targetId }),
                ...(message.target === undefined
                    ? {}
                    : { target: message.target }),
            },
            context
        )
        return events.length > 0
            ? events
            : abilityNotice(
                  actor,
                  'Заклинание недоступно: проверьте цель, ману и восстановление.'
              )
    }
    return executeAttackAbility(
        actor,
        message.targetId,
        id,
        context,
        message.target
    )
}
function executeAttackAbility(
    actor: GameCharacter,
    targetId: string | undefined,
    id: AbilityId,
    context: AbilityContext,
    target?: WorldCombatTarget
): GameEventPayload[] {
    const definition = ABILITY_DEFINITIONS[id]
    if (actor.mana < definition.mana || actor.energy < definition.energy) {
        return abilityNotice(actor, 'Недостаточно сил для способности.')
    }
    if (id !== 'shot' && id !== 'spark' && id !== 'skeleton_strike') {
        return []
    }
    const events =
        context.requestAbilityAttack?.(
            actor,
            targetId,
            id,
            context.now,
            target
        ) ?? []
    if (
        events.some(
            (event) => event.kind === 'attack' && event.actorId === actor.id
        )
    ) {
        actor.abilities.availableAt[id] = context.now + definition.cooldownMs
        return events
    }
    return events.length > 0
        ? events
        : abilityNotice(actor, 'Цель недоступна для этой атаки.')
}
function castBarrier(actor: GameCharacter, now: number): GameEventPayload[] {
    const definition = ABILITY_DEFINITIONS.barrier
    if (actor.mana < definition.mana) {
        return abilityNotice(actor, 'Для барьера нужно 12 маны.')
    }
    if (
        actor.abilities.barrier !== null &&
        actor.abilities.barrier.expiresAt > now &&
        actor.abilities.barrier.remaining > 0
    ) {
        return abilityNotice(actor, 'Барьер уже действует.')
    }
    actor.mana -= definition.mana
    actor.abilities.availableAt.barrier = now + definition.cooldownMs
    actor.abilities.barrier = {
        remaining: BARRIER_RULES.absorption,
        expiresAt: now + BARRIER_RULES.durationMs,
        practiced: false,
    }
    actor.lockAction(now, definition.windupMs)
    actor.setAnimation('attack', now, definition.windupMs)
    return [
        {
            kind: 'status',
            actorId: actor.id,
            targetId: actor.id,
            statusId: 'barrier',
            abilityId: 'barrier',
            amount: BARRIER_RULES.absorption,
            expiresAt: now + BARRIER_RULES.durationMs,
        },
    ]
}
function parsePrayerIntent(input: unknown): PrayerIntent | undefined {
    if (!isRecord(input)) {
        return undefined
    }
    const record = input
    const mode = record['mode']
    const targetId = record['targetId']
    if (mode === 'purify_grave') {
        const target = parseWorldCombatTarget(record['target'])
        return target !== undefined && targetId === undefined
            ? { mode, target }
            : undefined
    }
    if (record['target'] !== undefined) {
        return undefined
    }
    return parseCharacterPrayerIntent(record)
}

function parseCharacterPrayerIntent(
    record: Record<string, unknown>
): PrayerIntent | undefined {
    const mode = record['mode']
    const targetId = record['targetId']
    if (mode === 'devotion' && targetId === undefined) {
        return { mode }
    }
    if (mode === 'harm' && (targetId === undefined || validId(targetId))) {
        return targetId === undefined ? { mode } : { mode, targetId }
    }
    if ((mode === 'restore' || mode === 'revive') && validId(targetId)) {
        return { mode, targetId }
    }
    return undefined
}
function validId(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 100
    )
}
function isRecord(input: unknown): input is Record<string, unknown> {
    return input !== null && typeof input === 'object' && !Array.isArray(input)
}
