import type { AgentDecision } from '@my-game-ratata/contracts'

import type { AgentDecisionResult } from '../game/agentDecisions'
import type { GameCharacter } from '../game/character'
import { snapshotCharacterRoute } from '../game/characterRoute'
import type { CompanionService } from '../game/companions'
import { distance } from '../game/math'
import type { GameRoom } from '../game/room'
import {
    crossGuideExit,
    guideProximity,
    moveTripLeg,
    planGuideLeg,
} from './guideNavigation'
import { guideReceipt, type NpcAiGuide } from './guideState'
import { npcSelfTravelLocalError } from './guideTargets'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiEvent } from './types'

const escortGraceMs = 5_000

export function releasePreviousCompanion(
    companions: CompanionService,
    actor: GameCharacter
): void {
    const leaderId = actor.soul.companion?.leaderId
    if (leaderId != null) {
        companions.releaseAssistance(leaderId, actor, {
            preserveMovement: true,
        })
    }
}

export function reviseSelfTravel(
    companions: CompanionService,
    state: NpcAiActorState,
    trip: NpcAiGuide,
    decision: Extract<AgentDecision, { type: 'travel_to' }>,
    id: string,
    now: number,
    escortId?: string
): AgentDecisionResult {
    const { actor, token } = state
    if (
        actor === undefined ||
        token === undefined ||
        !companions.isModelControlOwner(actor, token, now)
    ) {
        return {
            accepted: false,
            error: 'Персонаж сейчас не может изменить сопровождение.',
            events: [],
        }
    }
    trip.id = id
    trip.decision = decision
    if (escortId === undefined) {
        delete trip.escortId
    } else {
        trip.escortId = escortId
    }
    delete trip.escortMissingSince
    return { accepted: true, error: null, events: [] }
}

export function stopNpcSelfTravelEscort(
    guide: NpcAiGuide | undefined,
    playerId: string
): boolean {
    if (guide?.decision.type !== 'travel_to' || guide.escortId !== playerId) {
        return false
    }
    delete guide.escortId
    delete guide.escortMissingSince
    return true
}

export function reconcileSelfTravel(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    actor: GameCharacter,
    guide: NpcAiGuide,
    now: number,
    crossed: boolean
): NpcAiEvent | undefined {
    updateEscort(room, actor, guide, now)
    if (crossed) {
        return continueAfterCrossing(room, companions, state, actor, guide, now)
    }
    if (crossGuideExit(room, companions, state, actor, guide, now)) {
        return undefined
    }
    if (
        guide.exit === undefined &&
        distance(actor.position, guide.destination) <= 1
    ) {
        return atLocalDestination(room, companions, state, actor, guide, now)
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

function continueAfterCrossing(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    actor: GameCharacter,
    guide: NpcAiGuide,
    now: number
): NpcAiEvent | undefined {
    const goal = guide.goal
    const error =
        (goal?.locationId === actor.locationId
            ? npcSelfTravelLocalError(room, actor, goal)
            : undefined) ?? planGuideLeg(room, actor, guide, now)
    return error === undefined
        ? continueSelfTravel(room, companions, state, actor, guide, now)
        : guideReceipt(guide, 'failed', error, now)
}

function atLocalDestination(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    actor: GameCharacter,
    guide: NpcAiGuide,
    now: number
): NpcAiEvent | undefined {
    const interior = guide.goal?.interior
    if (
        guide.enteringBuilding === true ||
        interior === undefined ||
        distance(actor.position, interior) <= 1
    ) {
        return guideReceipt(guide, 'completed', 'arrived', now)
    }
    guide.enteringBuilding = true
    guide.destination = { ...interior }
    return continueSelfTravel(room, companions, state, actor, guide, now)
}

function continueSelfTravel(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    actor: GameCharacter,
    guide: NpcAiGuide,
    now: number
): NpcAiEvent | undefined {
    const result = moveTripLeg(room, companions, state, actor, guide, now)
    room.publishEvents(result.events)
    return result.accepted
        ? undefined
        : guideReceipt(guide, 'failed', result.error ?? 'Путь недоступен.', now)
}

function updateEscort(
    room: GameRoom,
    actor: GameCharacter,
    guide: NpcAiGuide,
    now: number
): void {
    const escortId = guide.escortId
    if (escortId === undefined) {
        return
    }
    const escort = room.getCharacter(escortId)
    if (
        escort?.controllerKind !== 'network_player' ||
        !escort.connected ||
        !escort.alive ||
        escort.tags.has('offline') ||
        escort.tags.has('state.retired')
    ) {
        stopNpcSelfTravelEscort(guide, escortId)
        return
    }
    if (guideProximity(room, escort, actor, now).visible) {
        delete guide.escortMissingSince
        return
    }
    guide.escortMissingSince ??= now
    if (now - guide.escortMissingSince >= escortGraceMs) {
        stopNpcSelfTravelEscort(guide, escortId)
    }
}
