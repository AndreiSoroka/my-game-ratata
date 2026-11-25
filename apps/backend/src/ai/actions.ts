import type { AgentDecision, Vector2 } from '@my-game-ratata/contracts'
import { CENTER_LOCATION_ID, isBladeAbility } from '@my-game-ratata/contracts'

import { knowsAbility } from '../game/abilityState'
import type { GameCharacter } from '../game/character'
import { snapshotCharacterRoute } from '../game/characterRoute'
import { canUseCombat } from '../game/combatPermission'
import { distance } from '../game/math'
import type { NavigationService } from '../game/navigation'
import { npcAiNavigationError } from './navigationPolicy'
import type { NpcAiEvent, NpcAiRole } from './types'

export interface PendingNpcAiAction {
    id: string
    decision: AgentDecision
    locationId: string
    destination: Vector2
    deadline: number
    done: boolean
    waitMs: number
}

/** These roles have no treasury, reward-authoring or controller-assignment powers. */
export function npcAiDecisionError(
    actor: GameCharacter,
    role: NpcAiRole,
    decision: AgentDecision,
    navigation?: NavigationService
): string | undefined {
    const advisorError = advisorDecisionError(role, decision)
    if (advisorError !== undefined) {
        return advisorError
    }
    if (outsideCoordinatorCity(actor, role)) {
        return 'The city coordinator must remain in its city'
    }
    switch (decision.type) {
        case 'attack':
            return role === 'companion' && canUseCombat(actor)
                ? undefined
                : 'This character has no basic attack available to this controller'
        case 'use_ability':
            return combatAbilityError(actor, decision)
        case 'move_to':
            return movementError(actor, role, decision, navigation)
        case 'configure_scenario':
            return role === 'companion'
                ? undefined
                : 'This role cannot configure its own routines'
        case 'dialogue_choice':
            return [
                'trade',
                'city_report',
                'quest_progress',
                'ask_dragon',
                'leave',
                'close',
            ].includes(decision.choiceId)
                ? undefined
                : 'This coordinator/companion role cannot accept contracts or spend rewards on its own'
        default:
            return otherDecisionError(role, decision)
    }
}

function otherDecisionError(
    role: NpcAiRole,
    decision: AgentDecision
): string | undefined {
    switch (decision.type) {
        case 'travel_to':
        case 'leave_companion':
        case 'propose_follow':
        case 'start_following':
            return role === 'companion'
                ? undefined
                : 'Only a companion can choose its own travel or company'
        case 'interact':
        case 'guide':
        case 'speak':
        case 'wait':
        case 'cancel_control':
            return undefined
        default:
            return 'This role may navigate, inspect services, talk and wait; it cannot change possessions, rewards or other controllers'
    }
}

function outsideCoordinatorCity(
    actor: GameCharacter,
    role: NpcAiRole
): boolean {
    return (
        role === 'city_coordinator' && actor.locationId !== CENTER_LOCATION_ID
    )
}

function combatAbilityError(
    actor: GameCharacter,
    decision: Extract<AgentDecision, { type: 'use_ability' }>
): string | undefined {
    if (
        (!isBladeAbility(decision.abilityId) &&
            decision.abilityId !== 'shot') ||
        !knowsAbility(actor, decision.abilityId)
    ) {
        return 'This combat technique has not been learned'
    }
    if (decision.abilityId === 'shot' && decision.targetId === undefined) {
        return 'A shot by this controller must target a visible opponent'
    }
    return decision.abilityId !== 'defensive_stance' && !canUseCombat(actor)
        ? 'This character refuses combat'
        : undefined
}

export function npcAiActionReceipt(
    pending: PendingNpcAiAction,
    actor: GameCharacter,
    now: number
): NpcAiEvent | undefined {
    if (actor.locationId !== pending.locationId) {
        return receipt(pending, now, 'cancelled', 'location_changed')
    }
    const route = snapshotCharacterRoute(actor)?.route
    if (route !== undefined) {
        const destination = route.points.at(-1)?.position
        if (destination !== undefined) {
            pending.destination = { ...destination }
        }
        return now >= pending.deadline
            ? receipt(pending, now, 'failed', 'movement_timeout')
            : undefined
    }
    return distance(actor.position, pending.destination) <= 1
        ? receipt(pending, now, 'completed', 'arrived')
        : receipt(pending, now, 'failed', 'blocked_or_cancelled')
}

function receipt(
    pending: PendingNpcAiAction,
    now: number,
    status: 'completed' | 'failed' | 'cancelled',
    reason: string
): NpcAiEvent {
    return {
        kind: 'action',
        id: pending.id,
        decision: pending.decision,
        at: now,
        status,
        reason,
    }
}

function movementError(
    actor: GameCharacter,
    role: NpcAiRole,
    decision: Extract<AgentDecision, { type: 'move_to' }>,
    navigation?: NavigationService
): string | undefined {
    if (role !== 'companion' && actor.locationId !== CENTER_LOCATION_ID) {
        return 'New AI errands are limited to the city; ordinary companion following remains available'
    }
    return decision.append === true
        ? 'Wait for the current movement receipt before starting another route'
        : npcAiNavigationError(actor, decision.target, navigation)
}

function advisorDecisionError(
    role: NpcAiRole,
    decision: AgentDecision
): string | undefined {
    return (role === 'advisor' || role === 'necromancer') &&
        !['speak', 'wait', 'cancel_control'].includes(decision.type)
        ? `This ${role} conversation may answer from knowledge without taking over the character controller`
        : undefined
}
