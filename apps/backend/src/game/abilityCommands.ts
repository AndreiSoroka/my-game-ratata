import {
    type AbilityClientMessage,
    type AbilityId,
    type AshRiteMessage,
    BARRIER_RULES,
    type GameEventPayload,
    isArrowAbility,
    isBladeAttackAbility,
    type WorldCombatTarget,
} from '@my-game-ratata/contracts'

import {
    type AbilityContext,
    abilityNotice,
    authoredAbilityNotice,
} from './abilityContext'
import { activeBarrier, knowsAbility } from './abilityState'
import { cancelAshRaise } from './ashRaising'
import { isAshRiteMessage } from './ashRiteCommands'
import { toggleDefensiveStance } from './bladeStance'
import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'
import { constellationModifiers } from './constellationModifiers'
import { effectiveAbility } from './effectiveParameters'
import { castUtilitySpell, isUtilitySpell } from './magicAbilities'
import { learnAbility } from './magicLearning'
import { activeMagicChannel, cancelMagicChannel } from './magicState'
import { pray } from './prayer'
import { cancelPrayerCast } from './prayerCancellation'
import { recordResourceSpend } from './resourcePractice'
import { canPerformSkillAction } from './skillProgression'
import { castSpell } from './spellCasting'

export { parseAbilityCommand } from './abilityParsing'

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
        cancelAshRaise(actor)
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
    return handleKnownAbility(actor, message, context)
}

function handleKnownAbility(
    actor: GameCharacter,
    message: Extract<AbilityClientMessage, { type: 'use_ability' }>,
    context: AbilityContext
): GameEventPayload[] {
    const id = message.abilityId
    if (!knowsAbility(actor, id)) {
        return authoredAbilityNotice(actor, 'combat.unlearned')
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
        return authoredAbilityNotice(actor, 'combat.actionUnavailable')
    }
    if (context.now < (actor.abilities.availableAt[id] ?? 0)) {
        return authoredAbilityNotice(actor, 'combat.cooldown')
    }
    return isAshRiteMessage(message)
        ? (context.useAshRite?.(actor, message, context) ?? [])
        : executeAbility(actor, message, context)
}
function executeAbility(
    actor: GameCharacter,
    message: Exclude<
        Extract<AbilityClientMessage, { type: 'use_ability' }>,
        AshRiteMessage
    >,
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
    if (isUtilitySpell(id)) {
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
        return executeFireSpell(actor, id, message, context)
    }
    if (message.targetId === undefined && message.target === undefined) {
        return authoredAbilityNotice(actor, 'combat.chooseTarget')
    }
    return executeAttackAbility(
        actor,
        message.targetId,
        id,
        context,
        message.target
    )
}

function executeFireSpell(
    actor: GameCharacter,
    id: 'fireball' | 'greater_fireball',
    message: { targetId?: string; target?: WorldCombatTarget },
    context: AbilityContext
): GameEventPayload[] {
    const events = castSpell(
        actor,
        {
            type: 'cast_spell',
            skillId: id,
            ...(message.targetId === undefined
                ? {}
                : { targetId: message.targetId }),
            ...(message.target === undefined ? {} : { target: message.target }),
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
        return authoredAbilityNotice(actor, 'combat.lowAbilityEnergy')
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
        : authoredAbilityNotice(actor, 'combat.attackUnavailable')
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
        return authoredAbilityNotice(actor, 'combat.barrierActive')
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
