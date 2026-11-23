import type { AgentDecision } from '@my-game-ratata/contracts'

import type { AgentDecisionResult } from '../game/agentDecisions'
import type { GameCharacter } from '../game/character'
import { snapshotCharacterRoute } from '../game/characterRoute'
import type { CompanionService } from '../game/companions'
import { distance } from '../game/math'
import { regionalRoute } from '../game/regionalNavigation'
import type { GameRoom } from '../game/room'
import {
    crossGuideExit,
    guideProximity,
    type GuideView,
    moveGuide,
    moveTripLeg,
    planGuideLeg,
    receiveGuideCrossing,
} from './guideNavigation'
import { guideReceipt, type NpcAiGuide } from './guideState'
export type { NpcAiGuide } from './guideState'
import {
    npcGuideTargetError,
    npcSelfTravelTargetError,
    resolveNpcGuideGoal,
} from './guideTargets'
import type { NpcAiActorState } from './runtimeState'
import {
    reconcileSelfTravel,
    releasePreviousCompanion,
    reviseSelfTravel,
} from './selfTravel'
export { stopNpcSelfTravelEscort } from './selfTravel'
import type { NpcAiEvent } from './types'

type GuideDecision = Extract<AgentDecision, { type: 'guide' }>
type TravelDecision = Extract<AgentDecision, { type: 'travel_to' }>

export function beginNpcGuide(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    decision: GuideDecision,
    id: string,
    now: number
): AgentDecisionResult {
    if (state.task?.requesterId == null) {
        return rejected(
            'Для сопровождения нужны принявший поручение NPC и собеседник.'
        )
    }
    return beginTrip(room, companions, state, decision, id, now)
}

export function beginNpcSelfTravel(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    decision: TravelDecision,
    id: string,
    now: number,
    escortId?: string
): AgentDecisionResult {
    const currentTrip = state.guide
    const invitedEscort = decision.inviteEscort ? escortId : undefined
    if (
        currentTrip?.decision.type === 'travel_to' &&
        currentTrip.decision.targetKey === decision.targetKey
    ) {
        return reviseSelfTravel(
            companions,
            state,
            currentTrip,
            decision,
            id,
            now,
            invitedEscort
        )
    }
    return beginTrip(room, companions, state, decision, id, now, invitedEscort)
}

function beginTrip(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    decision: GuideDecision | TravelDecision,
    id: string,
    now: number,
    escortId?: string
): AgentDecisionResult {
    const actor = state.actor
    const token = state.token
    if (actor === undefined || token === undefined) {
        return rejected('Персонаж сейчас не может отправиться в путь.')
    }
    const checkTarget =
        decision.type === 'travel_to'
            ? npcSelfTravelTargetError
            : npcGuideTargetError
    const error = checkTarget(
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
        ...(escortId === undefined ? {} : { escortId }),
    }
    const planningError = planGuideLeg(room, actor, guide, now)
    if (planningError !== undefined) {
        return rejected(planningError)
    }
    const result = moveTripLeg(room, companions, state, actor, guide, now)
    if (!result.accepted) {
        return result
    }
    companions.setModelControlExclusive(actor, token, true, now)
    if (decision.type === 'travel_to') {
        releasePreviousCompanion(companions, actor)
    }
    state.pending = undefined
    state.guide = guide
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
    const crossed = actor.locationId !== guide.locationId
    if (
        guideExpired(guide, now) ||
        !receiveGuideCrossing(room, companions, state, actor, guide, now)
    ) {
        return guideReceipt(
            guide,
            'failed',
            guide.decision.type === 'travel_to'
                ? 'Поездка прервана: истекло время или изменилась локация.'
                : 'Сопровождение прервано: истекло время или изменилась локация.',
            now
        )
    }
    if (guide.decision.type === 'travel_to') {
        return reconcileSelfTravel(
            room,
            companions,
            state,
            actor,
            guide,
            now,
            crossed
        )
    }
    return reconcileGuidedTrip(room, companions, state, actor, guide, now)
}

function reconcileGuidedTrip(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    actor: GameCharacter,
    guide: NpcAiGuide,
    now: number
): NpcAiEvent | undefined {
    const requester = room.getCharacter(state.task?.requesterId ?? '')
    const view = guideProximity(room, requester, actor, now)
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
            return guideReceipt(guide, 'failed', error, now)
        }
    }
    if (crossGuideExit(room, companions, state, actor, guide, now)) {
        return undefined
    }
    return guideArrival(guide, actor, view.range, now)
}

function guideExpired(guide: NpcAiGuide, now: number): boolean {
    return now >= guide.deadline || now >= (guide.legDeadline ?? guide.deadline)
}
function mustWait(guide: NpcAiGuide, view: GuideView, now: number): boolean {
    const crossing =
        guide.exit !== undefined && now < (guide.crossingGraceUntil ?? 0)
    return (!view.visible || view.range > 80) && !crossing
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
    if (guide.awaitingPartner === true) {
        guide.awaitingPartner = false
        const error = planGuideLeg(room, actor, guide, now)
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
            ? guideReceipt(guide, 'completed', 'arrived_with_requester', now)
            : undefined
    }
    return snapshotCharacterRoute(actor)?.route === undefined
        ? guideReceipt(
              guide,
              'failed',
              'Путь к месту заблокирован или отменён.',
              now
          )
        : undefined
}
function rejected(error: string): AgentDecisionResult {
    return { accepted: false, error, events: [] }
}
