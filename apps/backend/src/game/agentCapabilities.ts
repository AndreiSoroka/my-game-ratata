import {
    type AbilityClientMessage,
    type AgentDecision,
    type CharacterControlCommand,
    type GameEventPayload,
    isMotherPrayer,
} from '@my-game-ratata/contracts'

import { parseAbilityCommand } from './abilityCommands'
import { knowsAbility } from './abilityState'
import type { AgentDecisionResult, CompanionWorld } from './agentDecisions'
import type { GameCharacter } from './character'
import { parseControlCommand } from './characterControl'
import { companionProfiles } from './companionProfiles'
import { planMotherPrayer } from './motherPrayerPlan'
import { canPerformSkillAction } from './skillProgression'

export function isAgentAbility(
    decision: AgentDecision
): decision is AbilityClientMessage {
    return (
        decision.type === 'use_ability' ||
        decision.type === 'learn_ability' ||
        decision.type === 'cancel_prayer'
    )
}
export function isAgentControl(
    decision: AgentDecision
): decision is CharacterControlCommand {
    return (
        decision.type === 'auto_action' ||
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
        record['type'] === 'learn_ability' ||
        record['type'] === 'cancel_prayer'
    ) {
        return parseAbilityCommand(record)
    }
    return parseControlCommand(record)
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
    if (message.type === 'cancel_prayer') {
        return cancelAgentPrayer(actor, message, world, now)
    }
    if (
        !canPerformSkillAction(actor, now) &&
        !canLeaveGuard(actor, message, now)
    ) {
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
function canLeaveGuard(
    actor: GameCharacter,
    message: AbilityClientMessage,
    now: number
): boolean {
    return (
        message.type === 'use_ability' &&
        message.abilityId === 'defensive_stance' &&
        actor.trainingTarget === undefined &&
        actor.combat.defensiveStance &&
        actor.alive &&
        actor.stunUntil <= now &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired')
    )
}

function abilityCanHarm(
    actor: GameCharacter,
    message: AbilityClientMessage,
    world: CompanionWorld,
    now: number
): boolean {
    if (
        message.type !== 'use_ability' ||
        message.abilityId === 'barrier' ||
        message.abilityId === 'defensive_stance'
    ) {
        return false
    }
    if (!('intent' in message)) {
        return true
    }
    if (message.intent.mode === 'devotion') {
        return false
    }
    if (!isMotherPrayer(message.abilityId)) {
        return false
    }
    if (world.charactersFor === undefined) {
        return (
            message.intent.mode === 'harm' || message.abilityId === 'pray_woven'
        )
    }
    return (
        planMotherPrayer(
            actor,
            message.intent,
            {
                characters: world.charactersFor(actor),
                navigation: world.navigationFor(actor),
                now,
            },
            message.abilityId
        )?.targets.some((target) => target.kind === 'harm') ?? false
    )
}
function cancelAgentPrayer(
    actor: GameCharacter,
    message: AbilityClientMessage,
    world: CompanionWorld,
    now: number
): AgentDecisionResult {
    const events = world.requestAbility?.(actor, message, now)
    return events === undefined
        ? rejected('Ability service unavailable')
        : { accepted: true, error: null, events }
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
