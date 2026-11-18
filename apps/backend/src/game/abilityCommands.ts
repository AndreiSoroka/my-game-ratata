import {
    type AbilityClientMessage,
    type AbilityId,
    abilityIds,
    BARRIER_RULES,
    type GameEventPayload,
    isBladeAttackAbility,
    isPrayerAction,
    type LearnAbilityId,
    type PrayerActionId,
    type WorldCombatTarget,
} from '@my-game-ratata/contracts'

import { type AbilityContext, abilityNotice } from './abilityContext'
import { knowsAbility } from './abilityState'
import { toggleDefensiveStance } from './bladeStance'
import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'
import { parseCombatReference } from './combatTargetParsing'
import { constellationModifiers } from './constellationModifiers'
import { effectiveAbility } from './effectiveParameters'
import { learnAbility } from './magicLearning'
import { pray } from './prayer'
import { cancelPrayerCast } from './prayerCancellation'
import {
    parsePrayerIntent,
    validAbilityTargetId as validId,
} from './prayerIntentParsing'
import { recordResourceSpend } from './resourcePractice'
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
            ![
                'pray',
                'pray_road',
                'pray_lantern',
                'pray_grave',
                'spark',
                'barrier',
                'shot',
            ].includes(id) ||
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
    if (isPrayerAction(id)) {
        const intent = parsePrayerIntent(record['intent'])
        return intent === undefined
            ? undefined
            : { type: 'use_ability', abilityId: id, intent }
    }
    const reference = parseCombatReference(record)
    if (reference === undefined) {
        return undefined
    }
    return {
        type: 'use_ability',
        abilityId: id as Exclude<AbilityId, PrayerActionId>,
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
    if (id === 'defensive_stance') {
        return toggleDefensiveStance(actor, context.now)
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
    if ('intent' in message) {
        return pray(
            actor,
            context.now,
            context.random,
            context,
            message.intent,
            message.abilityId
        )
    }
    if (id === 'barrier') {
        return castBarrier(actor, context.now)
    }
    if (freeAimAttack(id)) {
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
    const definition = effectiveAbility(
        actor,
        id,
        context.navigation.grid.tileWidth
    )
    if (actor.mana < definition.mana || actor.energy < definition.energy) {
        return abilityNotice(actor, 'Недостаточно сил для способности.')
    }
    if (
        id !== 'shot' &&
        id !== 'spark' &&
        id !== 'skeleton_strike' &&
        !isBladeAttackAbility(id)
    ) {
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
    const definition = effectiveAbility(actor, 'barrier')
    const modifiers = constellationModifiers(actor)
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
    const resourceSpend = recordResourceSpend(actor, 'mana', definition.mana)
    actor.abilities.barrier = {
        ...(resourceSpend === undefined ? {} : { resourceSpend }),
        remaining: BARRIER_RULES.absorption + modifiers.barrierAbsorptionBonus,
        expiresAt:
            now + BARRIER_RULES.durationMs + modifiers.barrierDurationBonus,
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
            amount: BARRIER_RULES.absorption + modifiers.barrierAbsorptionBonus,
            expiresAt:
                now + BARRIER_RULES.durationMs + modifiers.barrierDurationBonus,
        },
    ]
}

function freeAimAttack(id: AbilityId): boolean {
    return id === 'shot' || id === 'spark' || isBladeAttackAbility(id)
}
