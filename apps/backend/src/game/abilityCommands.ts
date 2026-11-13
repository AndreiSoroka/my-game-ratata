import {
    ABILITY_DEFINITIONS,
    type AbilityClientMessage,
    type AbilityId,
    abilityIds,
    BARRIER_RULES,
    type GameEventPayload,
    type LearnAbilityId,
    type PrayerIntent,
} from '@my-game-ratata/contracts'

import { type AbilityContext, abilityNotice } from './abilityContext'
import { knowsAbility } from './abilityState'
import type { GameCharacter } from './character'
import { learnAbility } from './magicLearning'
import { pray } from './prayer'
import { canPerformSkillAction } from './skillProgression'
import { castSpell } from './spellCasting'

export function parseAbilityCommand(
    record: Record<string, unknown>
): AbilityClientMessage | undefined {
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
    if (targetId !== undefined && !validId(targetId)) {
        return undefined
    }
    return {
        type: 'use_ability',
        abilityId: id as Exclude<AbilityId, 'pray'>,
        ...(targetId === undefined ? {} : { targetId }),
    }
}
export function handleAbilityCommand(
    actor: GameCharacter,
    message: AbilityClientMessage,
    context: AbilityContext
): GameEventPayload[] {
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
    if (message.targetId === undefined) {
        return abilityNotice(actor, 'Сначала выберите цель.')
    }
    if (id === 'fireball' || id === 'greater_fireball') {
        const events = castSpell(
            actor,
            { type: 'cast_spell', skillId: id, targetId: message.targetId },
            context
        )
        return events.length > 0
            ? events
            : abilityNotice(
                  actor,
                  'Заклинание недоступно: проверьте цель, ману и восстановление.'
              )
    }
    return executeAttackAbility(actor, message.targetId, id, context)
}
function executeAttackAbility(
    actor: GameCharacter,
    targetId: string,
    id: AbilityId,
    context: AbilityContext
): GameEventPayload[] {
    const definition = ABILITY_DEFINITIONS[id]
    if (actor.mana < definition.mana || actor.energy < definition.energy) {
        return abilityNotice(actor, 'Недостаточно сил для способности.')
    }
    if (id !== 'shot' && id !== 'spark' && id !== 'skeleton_strike') {
        return []
    }
    const events =
        context.requestAbilityAttack?.(actor, targetId, id, context.now) ?? []
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
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        return undefined
    }
    const record = input as Record<string, unknown>
    const mode = record['mode']
    const targetId = record['targetId']
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
