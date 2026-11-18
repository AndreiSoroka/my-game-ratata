import type { AgentDecision, Vector2 } from '@my-game-ratata/contracts'

import type { AgentDecisionResult } from '../game/agentDecisions'
import type { GameCharacter } from '../game/character'
import { snapshotCharacterRoute } from '../game/characterRoute'
import type { CompanionService } from '../game/companions'
import { distance } from '../game/math'
import { visibilityRadius } from '../game/queries'
import { regionalRoute } from '../game/regionalNavigation'
import type { GameRoom } from '../game/room'
import { npcAiDecisionError } from './actions'
import {
    crossGuideExit,
    moveGuide,
    planGuideLeg,
    receiveGuideCrossing,
} from './guideNavigation'
import type { NpcAiGuide } from './guideState'
export type { NpcAiGuide } from './guideState'
import { npcGuideTargetError, resolveNpcGuideGoal } from './guideTargets'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiEvent } from './types'

type GuideDecision = Extract<AgentDecision, { type: 'guide' }>

export function beginNpcGuide(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    decision: GuideDecision,
    id: string,
    now: number
): AgentDecisionResult {
    const actor = state.actor
    if (
        actor === undefined ||
        state.task?.requesterId == null ||
        state.token === undefined
    ) {
        return rejected(
            'Для сопровождения нужны принявший поручение NPC и собеседник.'
        )
    }
    const error = npcGuideTargetError(
        room,
        actor,
        state.config.role,
        decision.targetKey
    )
    if (error !== undefined) {
        return rejected(error)
    }
    const goal = resolveNpcGuideGoal(room, actor, decision.targetKey)
    if (goal === undefined) {
        return rejected('Это место мне пока неизвестно.')
    }
    const route = regionalRoute(actor.locationId, goal.locationId)
    if (route === undefined) {
        return rejected('Дорога к этому месту неизвестна.')
    }
    const guide: NpcAiGuide = {
        id,
        decision,
        goal,
        route,
        locationId: actor.locationId,
        destination: { ...actor.position },
        deadline: now + Math.max(180_000, route.length * 120_000),
    }
    const planningError = planGuideLeg(room, state, actor, guide, now)
    if (planningError !== undefined) {
        return rejected(planningError)
    }
    if (guide.exit === undefined) {
        const policyError = npcAiDecisionError(
            actor,
            state.config.role,
            { type: 'move_to', target: guide.destination },
            room.navigationFor(actor)
        )
        if (policyError !== undefined) {
            return rejected(policyError)
        }
    }
    companions.setModelControlExclusive(actor, state.token, true, now)
    const result = moveGuide(room, companions, state, actor, guide, now)
    if (result.accepted) {
        state.guide = guide
    }
    return result
}

/** Ordinary movement and travel advance the guide; unseen player coordinates never select a route. */
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
    if (
        guideExpired(guide, now) ||
        !receiveGuideCrossing(room, companions, state, actor, guide, now)
    ) {
        return receipt(
            guide,
            'failed',
            'Сопровождение прервано: истекло время или изменилась локация.',
            now
        )
    }
    const view = guideProximity(room, state, actor, now)
    rememberCrossingGrace(guide, actor, view, now)
    if (mustWait(guide, view, now)) {
        return pauseGuide(room, companions, state, guide, actor, now)
    }
    if (guide.waitingSince !== undefined) {
        if (!view.visible || view.range > 48) {
            return undefined
        }
        const error = resumeGuide(room, companions, state, guide, actor, now)
        if (error !== undefined) {
            return receipt(guide, 'failed', error, now)
        }
    }
    if (crossGuideExit(room, companions, state, actor, guide, now)) {
        return undefined
    }
    return guideArrival(guide, actor, view.range, now)
}

interface GuideView {
    visible: boolean
    range: number
    position?: Vector2
}
function guideExpired(guide: NpcAiGuide, now: number): boolean {
    return now >= guide.deadline || now >= (guide.legDeadline ?? guide.deadline)
}
function mustWait(guide: NpcAiGuide, view: GuideView, now: number): boolean {
    const crossing =
        guide.exit !== undefined && now < (guide.crossingGraceUntil ?? 0)
    return (!view.visible || view.range > 80) && !crossing
}
function guideProximity(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number
): GuideView {
    const requester = room.getCharacter(state.task?.requesterId ?? '')
    if (
        requester === undefined ||
        !requester.alive ||
        requester.locationId !== actor.locationId
    ) {
        return { visible: false, range: Infinity }
    }
    const range = distance(actor.position, requester.position)
    const visible =
        range <= visibilityRadius(actor, requester, 80, now) &&
        room
            .navigationFor(actor)
            .hasLineOfSight(actor.position, requester.position)
    return visible
        ? {
              visible: true,
              range,
              position: { ...requester.position },
          }
        : { visible: false, range: Infinity }
}
function rememberCrossingGrace(
    guide: NpcAiGuide,
    actor: GameCharacter,
    view: GuideView,
    now: number
): void {
    if (
        guide.exit !== undefined &&
        view.position !== undefined &&
        view.range <= 48 &&
        distance(actor.position, guide.exit.point) <= 48 &&
        distance(view.position, guide.exit.point) <= 48
    ) {
        guide.crossingGraceUntil = now + 5000
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
        ? receipt(guide, 'failed', 'Собеседник не вернулся к проводнику.', now)
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
    if (guide.awaitingPartner === true) {
        guide.awaitingPartner = false
        const error = planGuideLeg(room, state, actor, guide, now)
        if (error !== undefined) {
            return error
        }
    }
    const result = moveGuide(room, companions, state, actor, guide, now)
    room.publishEvents(result.events)
    return result.accepted ? undefined : (result.error ?? 'Путь недоступен.')
}
function guideArrival(
    guide: NpcAiGuide,
    actor: GameCharacter,
    range: number,
    now: number
): NpcAiEvent | undefined {
    if (distance(actor.position, guide.destination) <= 1) {
        return guide.exit === undefined && range <= 48
            ? receipt(guide, 'completed', 'arrived_with_requester', now)
            : undefined
    }
    return snapshotCharacterRoute(actor)?.route === undefined
        ? receipt(
              guide,
              'failed',
              'Путь к месту заблокирован или отменён.',
              now
          )
        : undefined
}
function receipt(
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
function rejected(error: string): AgentDecisionResult {
    return { accepted: false, error, events: [] }
}
