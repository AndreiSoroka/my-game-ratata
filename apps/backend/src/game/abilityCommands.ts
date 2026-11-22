import {
    type AbilityClientMessage,
    type AbilityId,
    abilityIds,
    BARRIER_RULES,
    type GameEventPayload,
    isArrowAbility,
    isBladeAttackAbility,
    isPrayerAction,
    type LearnAbilityId,
    type PrayerActionId,
    type WorldCombatTarget,
} from '@my-game-ratata/contracts'

import { type AbilityContext, abilityNotice } from './abilityContext'
import { activeBarrier, knowsAbility } from './abilityState'
import { toggleDefensiveStance } from './bladeStance'
import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'
import { parseCombatReference } from './combatTargetParsing'
import { constellationModifiers } from './constellationModifiers'
import { effectiveAbility } from './effectiveParameters'
import { castUtilitySpell } from './magicAbilities'
import { learnAbility } from './magicLearning'
import { activeMagicChannel, cancelMagicChannel } from './magicState'
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
    const type = record['type']
    if (type === 'cancel_prayer' || type === 'cancel_magic') {
        return Object.keys(record).length === 1 ? { type } : undefined
    }
    const id = record['abilityId']
    if (typeof id !== 'string' || !abilityIds.includes(id as AbilityId)) {
        return undefined
    }
    if (type === 'learn_ability') {
        return parseLearnAbility(id, record['targetId'])
    }
    if (type !== 'use_ability') {
        return undefined
    }
    if (isPrayerAction(id)) {
        const intent = parsePrayerIntent(record['intent'])
        return intent === undefined
            ? undefined
            : { type: 'use_ability', abilityId: id, intent }
    }
    return parseSpellReference(id as Exclude<AbilityId, PrayerActionId>, record)
}

function parseLearnAbility(
    id: string,
    targetId: unknown
): AbilityClientMessage | undefined {
    const learnable: readonly string[] = [
        'pray',
        'pray_road',
        'pray_lantern',
        'pray_grave',
        'spark',
        'barrier',
        'shot',
    ]
    return learnable.includes(id) && validId(targetId)
        ? { type: 'learn_ability', abilityId: id as LearnAbilityId, targetId }
        : undefined
}

function parseSpellReference(
    id: Exclude<AbilityId, PrayerActionId>,
    record: Record<string, unknown>
): AbilityClientMessage | undefined {
    const reference = parseCombatReference(record)
    if (
        reference === undefined ||
        (utilitySpell(id) && Object.keys(reference).length > 0) ||
        (id === 'sniper_shot' && reference.targetId === undefined)
    ) {
        return undefined
    }
    return {
        type: 'use_ability',
        abilityId: id,
        ...reference,
    }
}
export function handleAbilityCommand(
    actor: GameCharacter,
    message: AbilityClientMessage,
    context: AbilityContext
): GameEventPayload[] {
    if (message.type === 'cancel_magic') {
        cancelCharacterControl(actor)
        return cancelMagicChannel(actor, context.now)
    }
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
    const interruptsChains =
        id === 'dispel_magic' &&
        activeMagicChannel(actor, context.now)?.abilityId === 'chains'
    if (
        !canPerformSkillAction(actor, context.now, {
            allowMagicChannel: interruptsChains,
        })
    ) {
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
    if (utilitySpell(id)) {
        return castUtilitySpell(actor, id, context)
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
    if (message.targetId === undefined && message.target === undefined) {
        return abilityNotice(actor, 'Сначала выберите цель.')
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
        !isArrowAbility(id) &&
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
    if (actor.mana <= definition.mana) {
        return abilityNotice(
            actor,
            'Для Барьера нужна мана на создание и поглощение урона.'
        )
    }
    if (activeBarrier(actor, now) !== null) {
        return abilityNotice(actor, 'Барьер уже действует.')
    }
    actor.mana -= definition.mana
    actor.abilities.availableAt.barrier = now + definition.cooldownMs
    recordResourceSpend(actor, 'mana', definition.mana)
    const expiresAt =
        now + BARRIER_RULES.durationMs + modifiers.barrierDurationBonus
    actor.abilities.barrier = {
        expiresAt,
        practiced: false,
    }
    return [
        {
            kind: 'status',
            actorId: actor.id,
            targetId: actor.id,
            statusId: 'barrier',
            abilityId: 'barrier',
            expiresAt,
        },
    ]
}

function freeAimAttack(id: AbilityId): boolean {
    return id === 'shot' || id === 'spark' || isBladeAttackAbility(id)
}

function utilitySpell(
    id: AbilityId
): id is import('./magicAbilities').UtilitySpell {
    return (
        id === 'chains' ||
        id === 'city_portal' ||
        id === 'blink' ||
        id === 'dispel_magic'
    )
}
