import type { AgentDecision, Vector2 } from '@my-game-ratata/contracts'

import type { AgentDecisionResult } from '../game/agentDecisions'
import type { GameCharacter } from '../game/character'
import { snapshotCharacterRoute } from '../game/characterRoute'
import type { CompanionService } from '../game/companions'
import { distance } from '../game/math'
import type { GameRoom } from '../game/room'
import { npcAiDecisionError } from './actions'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiEvent } from './types'

type GuideDecision = Extract<AgentDecision, { type: 'guide' }>
export interface NpcAiGuide {
    id: string
    decision: GuideDecision
    locationId: string
    destination: Vector2
    waitingSince?: number
    deadline: number
}
function guideSource(
    room: GameRoom,
    state: NpcAiActorState,
    decision: GuideDecision
) {
    const actor = state.actor
    if (
        actor === undefined ||
        state.task?.requesterId == null ||
        state.token === undefined
    ) {
        return undefined
    }
    const building = room
        .navigationFor(actor)
        .grid.buildings?.find(
            (entry) => `building:${entry.id}` === decision.targetKey
        )
    return building === undefined
        ? undefined
        : { actor, building, token: state.token }
}
export function beginNpcGuide(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    decision: GuideDecision,
    id: string,
    now: number
): AgentDecisionResult {
    const source = guideSource(room, state, decision)
    if (source === undefined) {
        return {
            accepted: false,
            error: 'Для сопровождения нужны принявший поручение NPC, собеседник и известное здание.',
            events: [],
        }
    }
    const { actor, building, token } = source
    const move = { type: 'move_to' as const, target: { ...building.entry } }
    const error = npcAiDecisionError(
        actor,
        state.config.role,
        move,
        room.navigationFor(actor)
    )
    if (error !== undefined) {
        return { accepted: false, error, events: [] }
    }
    companions.setModelControlExclusive(actor, token, true, now)
    const result = companions.decide(actor, move, room, now, token)
    if (!result.accepted) {
        return result
    }
    room.adventureForWorkers().closeConversations(actor.id)
    state.guide = {
        id,
        decision,
        locationId: actor.locationId,
        destination: { ...building.entry },
        deadline: now + 180_000,
    }
    state.pending = {
        id: `${id}:walk`,
        decision: move,
        locationId: actor.locationId,
        destination: resolvedGuideDestination(actor, move.target),
        deadline: now + 120_000,
        done: false,
        waitMs: 0,
    }
    return result
}
function resolvedGuideDestination(
    actor: GameCharacter,
    target: Vector2
): Vector2 {
    return (
        snapshotCharacterRoute(actor)?.route?.points.at(-1)?.position ?? target
    )
}
/** Chooses only normal movement intentions; the player retains all their controls. */
export function reconcileNpcGuide(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    now: number
): NpcAiEvent | undefined {
    const guide = state.guide
    const actor = state.actor
    if (guide === undefined || actor === undefined) {
        return undefined
    }
    if (actor.locationId !== guide.locationId || now >= guide.deadline) {
        return guideReceipt(
            guide,
            'failed',
            'Сопровождение прервано: истекло время или изменилась локация.',
            now
        )
    }
    const proximity = guideProximity(room, state, actor)
    if (!proximity.visible || proximity.range > 80) {
        return pauseGuide(room, companions, state, guide, actor, now)
    }
    if (guide.waitingSince !== undefined) {
        if (proximity.range > 48) {
            return undefined
        }
        const error = resumeGuide(room, companions, state, guide, actor, now)
        if (error !== undefined) {
            return guideReceipt(guide, 'failed', error, now)
        }
    }
    return guideArrival(guide, actor, proximity.range, now)
}
function guideProximity(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter
): { visible: boolean; range: number } {
    const requester = room.getCharacter(state.task?.requesterId ?? '')
    if (requester === undefined) {
        return { visible: false, range: Infinity }
    }
    return {
        range: distance(actor.position, requester.position),
        visible:
            requester.alive &&
            requester.locationId === actor.locationId &&
            room
                .navigationFor(actor)
                .hasLineOfSight(actor.position, requester.position),
    }
}
function pauseGuide(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    guide: NpcAiGuide,
    actor: GameCharacter,
    now: number
): NpcAiEvent | undefined {
    if (guide.waitingSince === undefined) {
        guide.waitingSince = now
        companions.decide(
            actor,
            { type: 'cancel_control' },
            room,
            now,
            state.token
        )
        state.pending = undefined
    }
    return now - guide.waitingSince >= 60_000
        ? guideReceipt(
              guide,
              'failed',
              'Собеседник не вернулся к проводнику.',
              now
          )
        : undefined
}
function resumeGuide(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    guide: NpcAiGuide,
    actor: GameCharacter,
    now: number
): string | undefined {
    delete guide.waitingSince
    const result = companions.decide(
        actor,
        { type: 'move_to', target: guide.destination },
        room,
        now,
        state.token
    )
    room.publishEvents(result.events)
    if (!result.accepted) {
        return result.error ?? 'Путь недоступен.'
    }
    room.adventureForWorkers().closeConversations(actor.id)
    return undefined
}
function guideArrival(
    guide: NpcAiGuide,
    actor: GameCharacter,
    range: number,
    now: number
): NpcAiEvent | undefined {
    if (distance(actor.position, guide.destination) <= 1) {
        return range <= 48
            ? guideReceipt(guide, 'completed', 'arrived_with_requester', now)
            : undefined
    }
    return snapshotCharacterRoute(actor)?.route === undefined
        ? guideReceipt(
              guide,
              'failed',
              'Путь к зданию заблокирован или отменён.',
              now
          )
        : undefined
}
function guideReceipt(
    guide: NpcAiGuide,
    status: 'completed' | 'failed',
    reason: string,
    now: number
): NpcAiEvent {
    return {
        kind: 'action',
        id: guide.id,
        decision: guide.decision,
        status,
        reason,
        at: now,
    }
}
