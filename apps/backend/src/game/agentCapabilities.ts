import {
    type AbilityClientMessage,
    type AgentDecision,
    type CharacterControlCommand,
    DEITY_PRAYER_PROFILES,
    type GameEventPayload,
    PRAYER_RULES,
} from '@my-game-ratata/contracts'

import { parseAbilityCommand } from './abilityCommands'
import { knowsAbility } from './abilityState'
import type { AgentDecisionResult, CompanionWorld } from './agentDecisions'
import type { GameCharacter } from './character'
import { companionProfiles } from './companionProfiles'
import { prayerHarmTargets } from './prayerContext'
import { canPerformSkillAction } from './skillProgression'

export function isAgentAbility(
    decision: AgentDecision
): decision is AbilityClientMessage {
    return decision.type === 'use_ability' || decision.type === 'learn_ability'
}
export function isAgentControl(
    decision: AgentDecision
): decision is CharacterControlCommand {
    return (
        decision.type === 'follow' ||
        decision.type === 'auto_attack' ||
        decision.type === 'cancel_control'
    )
}
export function parseAgentCapability(
    record: Record<string, unknown>
): AbilityClientMessage | CharacterControlCommand | undefined {
    if (
        record['type'] === 'use_ability' ||
        record['type'] === 'learn_ability'
    ) {
        return parseAbilityCommand(record)
    }
    if (record['type'] === 'cancel_control') {
        return { type: 'cancel_control' }
    }
    const type = record['type']
    const targetId = record['targetId']
    if (type !== 'follow' && type !== 'auto_attack') {
        return undefined
    }
    if (
        targetId === null ||
        (typeof targetId === 'string' &&
            targetId.trim().length > 0 &&
            targetId.length <= 100)
    ) {
        return { type, targetId }
    }
    return undefined
}
export function actorRefusesCombat(actor: GameCharacter): boolean {
    return (
        companionProfiles[actor.id]?.canFight === false ||
        actor.soul.companion?.canFight === false
    )
}
export function applyAgentAbility(
    actor: GameCharacter,
    message: AbilityClientMessage,
    world: CompanionWorld,
    now: number
): AgentDecisionResult {
    if (!canPerformSkillAction(actor, now)) {
        return rejected(
            'Ability unavailable while dead, offline, stunned or busy'
        )
    }
    if (world.requestAbility === undefined) {
        return rejected('Ability service unavailable')
    }
    if (
        message.type === 'use_ability' &&
        !knowsAbility(actor, message.abilityId)
    ) {
        return rejected('Ability has not been learned')
    }
    if (
        actorRefusesCombat(actor) &&
        abilityCanHarm(actor, message, world, now)
    ) {
        return rejected('This personality refuses combat')
    }
    const knownBefore = knowsAbility(actor, message.abilityId)
    const events = world.requestAbility(actor, message, now)
    const learned = !knownBefore && knowsAbility(actor, message.abilityId)
    const performed = learned || events.some((event) => event.kind !== 'notice')
    return performed
        ? { accepted: true, error: null, events }
        : rejectionWithEvents(events)
}
export function applyAgentControl(
    actor: GameCharacter,
    message: CharacterControlCommand,
    world: CompanionWorld,
    now: number
): AgentDecisionResult {
    if (world.requestControl === undefined) {
        return rejected('Control service unavailable')
    }
    if (
        message.type === 'auto_attack' &&
        message.targetId !== null &&
        actorRefusesCombat(actor)
    ) {
        return rejected('This personality refuses combat')
    }
    if (
        message.type === 'follow' &&
        message.targetId !== null &&
        companionProfiles[actor.id]?.canFollow === false
    ) {
        return rejected('This personality refuses to leave its post')
    }
    return world.requestControl(actor, message, now)
        ? { accepted: true, error: null, events: [] }
        : rejected('Control target is unavailable or the actor cannot act')
}
function abilityCanHarm(
    actor: GameCharacter,
    message: AbilityClientMessage,
    world: CompanionWorld,
    now: number
): boolean {
    if (message.type === 'learn_ability' || message.abilityId === 'barrier') {
        return false
    }
    if (message.abilityId !== 'pray') {
        return true
    }
    const harmUnlocked =
        actor.progression.skills.miracles.level >= PRAYER_RULES.harmLevel &&
        DEITY_PRAYER_PROFILES[actor.progression.patron].harmTypes.length > 0
    if (!harmUnlocked) {
        return false
    }
    if (world.charactersFor === undefined) {
        return true
    }
    return (
        prayerHarmTargets(actor, {
            characters: world.charactersFor(actor),
            navigation: world.navigationFor(actor),
            now,
        }).length > 0
    )
}
function rejectionWithEvents(events: GameEventPayload[]): AgentDecisionResult {
    return {
        accepted: false,
        error:
            events.find((event) => event.kind === 'notice')?.text ??
            'Ability was rejected by shared rules',
        events,
    }
}
function rejected(error: string): AgentDecisionResult {
    return { accepted: false, error, events: [] }
}
