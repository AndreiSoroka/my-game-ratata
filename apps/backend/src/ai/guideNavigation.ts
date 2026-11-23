import { type Vector2, WORLD_DIRECTIONS } from '@my-game-ratata/contracts'

import type { AgentDecisionResult } from '../game/agentDecisions'
import type { GameCharacter } from '../game/character'
import { snapshotCharacterRoute } from '../game/characterRoute'
import type { CompanionService } from '../game/companions'
import { distance } from '../game/math'
import { visibilityRadius } from '../game/queries'
import { regionalExit, regionalRoute } from '../game/regionalNavigation'
import type { GameRoom } from '../game/room'
import { npcAiDecisionError } from './actions'
import type { NpcAiGuide } from './guideState'
import type { NpcAiActorState } from './runtimeState'
import { rememberNpcScouting } from './scouting'

export interface GuideView {
    visible: boolean
    range: number
    position?: Vector2
}

export function guideProximity(
    room: GameRoom,
    requester: GameCharacter | undefined,
    actor: GameCharacter,
    now: number
): GuideView {
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

export function planGuideLeg(
    room: GameRoom,
    actor: GameCharacter,
    guide: NpcAiGuide,
    now: number
): string | undefined {
    const goal = guide.goal
    if (goal === undefined) {
        return undefined
    }
    const route = regionalRoute(actor.locationId, goal.locationId)
    if (route === undefined) {
        return 'Дорога к этому месту неизвестна.'
    }
    guide.route = route
    const next = route[1]
    guide.exit =
        next === undefined
            ? undefined
            : regionalExit(
                  actor.position,
                  actor.locationId,
                  next,
                  room.navigationFor(actor)
              )
    if (next !== undefined && guide.exit === undefined) {
        return 'К нужному выходу сейчас нет проходимого пути.'
    }
    guide.destination = {
        ...(guide.exit?.point ?? goal.position ?? actor.position),
    }
    guide.locationId = actor.locationId
    guide.legDeadline = now + 120_000
    return undefined
}

export function moveGuide(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    actor: GameCharacter,
    guide: NpcAiGuide,
    now: number
): AgentDecisionResult {
    const result = companions.decide(
        actor,
        { type: 'move_to', target: guide.destination },
        room,
        now,
        state.token
    )
    if (result.accepted) {
        const destination =
            snapshotCharacterRoute(actor)?.route?.points.at(-1)?.position
        if (destination !== undefined && guide.decision.type === 'guide') {
            guide.destination = { ...destination }
        }
        room.adventureForWorkers().closeConversations(actor.id)
    }
    return result
}

export function moveTripLeg(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    actor: GameCharacter,
    guide: NpcAiGuide,
    now: number
): AgentDecisionResult {
    const error =
        guide.exit === undefined
            ? npcAiDecisionError(
                  actor,
                  state.config.role,
                  { type: 'move_to', target: guide.destination },
                  room.navigationFor(actor)
              )
            : undefined
    return error === undefined
        ? moveGuide(room, companions, state, actor, guide, now)
        : { accepted: false, error, events: [] }
}

/** A transition is accepted only after this guide physically selected and reached that adjacent exit. */
export function receiveGuideCrossing(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    actor: GameCharacter,
    guide: NpcAiGuide,
    now: number
): boolean {
    if (actor.locationId === guide.locationId) {
        return true
    }
    if (guide.exit?.nextLocationId !== actor.locationId) {
        return false
    }
    companions.decide(actor, { type: 'cancel_control' }, room, now, state.token)
    guide.locationId = actor.locationId
    guide.destination = { ...actor.position }
    if (guide.decision.type === 'guide') {
        guide.awaitingPartner = true
        guide.waitingSince = now
    }
    guide.exit = undefined
    guide.crossingGraceUntil = undefined
    guide.legDeadline = now + 120_000
    rememberNpcScouting(
        room,
        state,
        actor,
        `${guide.id}:hop:${actor.locationId}`,
        now
    )
    return true
}

export function crossGuideExit(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    actor: GameCharacter,
    guide: NpcAiGuide,
    now: number
): boolean {
    if (
        guide.exit === undefined ||
        distance(actor.position, guide.destination) > 1
    ) {
        return false
    }
    const direction = WORLD_DIRECTIONS[guide.exit.direction]
    const result = companions.decide(
        actor,
        { type: 'move', axis: { ...direction } },
        room,
        now,
        state.token
    )
    room.publishEvents(result.events)
    return result.accepted
}
