import type { AgentDecision, Vector2 } from '@my-game-ratata/contracts'
import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import { snapshotCharacterRoute } from '../game/characterRoute'
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
    if (
        role === 'city_coordinator' &&
        actor.locationId !== CENTER_LOCATION_ID
    ) {
        return 'The city coordinator must remain in its city'
    }
    switch (decision.type) {
        case 'move_to':
            return movementError(actor, role, decision, navigation)
        case 'interact':
        case 'guide':
        case 'speak':
        case 'wait':
        case 'cancel_control':
            return undefined
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
            return 'This role may navigate, inspect services, talk and wait; it cannot change possessions, rewards or other controllers'
    }
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
    return role === 'advisor' &&
        !['speak', 'wait', 'cancel_control'].includes(decision.type)
        ? 'This advisor may answer from knowledge, but does not replace its scripted controller'
        : undefined
}
