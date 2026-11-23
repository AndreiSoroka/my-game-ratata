import type { AgentDecision, GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiEvent, NpcAiReply } from './types'

type AttackDecision = Extract<AgentDecision, { type: 'attack' }>
type AttackOutcome =
    'attack_hit' | 'attack_missed' | 'attack_blocked' | 'attack_interrupted'

export interface PendingNpcAiAttack {
    id: string
    decision: AttackDecision
    combatActionId: string
    locationId: string
    done: boolean
    waitMs: number
    resolved?: AttackOutcome
}

export function trackNpcAiAttack(
    state: NpcAiActorState,
    actor: GameCharacter,
    decision: AttackDecision,
    reply: NpcAiReply,
    id: string
): boolean {
    const combatActionId = actor.pendingAttack?.actionId
    if (combatActionId === undefined) {
        return false
    }
    state.attack = {
        id,
        decision,
        combatActionId,
        locationId: actor.locationId,
        done: reply.done,
        waitMs: reply.waitMs,
    }
    return true
}

export function recordNpcAiAttackResolution(
    state: NpcAiActorState,
    actor: GameCharacter,
    combatActionId: string,
    events: readonly GameEventPayload[]
): void {
    const attack = state.attack
    if (
        state.actor !== actor ||
        attack?.combatActionId !== combatActionId ||
        attack.resolved !== undefined
    ) {
        return
    }
    if (
        events.some((event) => hitSelectedTarget(event, actor, attack.decision))
    ) {
        attack.resolved = 'attack_hit'
    } else if (
        events.some((event) =>
            blockedSelectedTarget(event, actor, attack.decision)
        )
    ) {
        attack.resolved = 'attack_blocked'
    } else {
        attack.resolved =
            events.length === 0 ? 'attack_interrupted' : 'attack_missed'
    }
}

export function reconcileNpcAiAttack(
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number
): Extract<NpcAiEvent, { kind: 'action' }> | undefined {
    const attack = state.attack
    if (attack === undefined) {
        return undefined
    }
    const changedLocation = actor.locationId !== attack.locationId
    const reason = changedLocation
        ? 'location_changed'
        : (attack.resolved ??
          (actor.pendingAttack?.actionId === attack.combatActionId
              ? undefined
              : 'attack_interrupted'))
    if (reason === undefined) {
        return undefined
    }
    const status =
        reason === 'attack_hit'
            ? 'completed'
            : reason === 'location_changed' || reason === 'attack_interrupted'
              ? 'cancelled'
              : 'failed'
    return {
        kind: 'action',
        id: attack.id,
        decision: attack.decision,
        at: now,
        status,
        reason,
    }
}

function blockedSelectedTarget(
    event: GameEventPayload,
    actor: GameCharacter,
    decision: AttackDecision
): boolean {
    return (
        decision.targetId !== undefined &&
        event.actorId === actor.id &&
        event.targetId === decision.targetId &&
        (event.kind === 'parry' || event.kind === 'absorb')
    )
}

function hitSelectedTarget(
    event: GameEventPayload,
    actor: GameCharacter,
    decision: AttackDecision
): boolean {
    return (
        event.actorId === actor.id &&
        (decision.target === undefined
            ? event.kind === 'damage' && event.targetId === decision.targetId
            : event.kind === 'world_damage' &&
              event.target?.kind === decision.target.kind &&
              event.target.id === decision.target.id)
    )
}
