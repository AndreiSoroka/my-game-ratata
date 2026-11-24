import {
    STOP_CORRECTION_MAX_AGE_MS,
    STOP_CORRECTION_MAX_DISTANCE,
    type StopCorrectionRequest,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { magicBlocksMovement } from './magicState'
import { distance } from './math'
import type { NavigationService } from './navigation'
import type { RoomSocket } from './roomMessaging'
import {
    closestStopPosition,
    type StopCorrectionLeg,
} from './stopCorrectionGeometry'
import {
    clearStopCorrectionAnchors,
    findStopCorrectionAnchor,
    publishStopCorrectionAnchor,
    replayStopOutcome,
    saveStopOutcome,
    type SnapshotReference,
} from './stopCorrectionJournal'

interface MovementEpisode {
    owner: RoomSocket
    locationId: string
    lifeStartedAt: number
    deathSequence: number
    trace: StopCorrectionLeg[]
    forward?: { axis: Vector2; remaining: number; at: number }
}

interface PendingStop {
    request: StopCorrectionRequest
    episode: MovementEpisode
    receivedAt: number
    anchorAt: number
}

interface ActorCorrectionState {
    credit: number
    episode?: MovementEpisode
    pending?: PendingStop
}

const actors = new WeakMap<GameCharacter, ActorCorrectionState>()

export function resetStopCorrectionStream(
    socket: RoomSocket,
    actor: GameCharacter
): void {
    invalidateManualStop(actor)
    clearStopCorrectionAnchors(socket)
}

export function recordStopCorrectionAnchor(
    socket: RoomSocket,
    actor: GameCharacter,
    reference: SnapshotReference,
    at: number
): void {
    publishStopCorrectionAnchor(
        socket,
        actor,
        reference,
        at,
        activeEpisode(actor, socket)
    )
}

export function replayStopCorrection(
    socket: RoomSocket,
    actor: GameCharacter,
    id: number
): boolean {
    const pending = actors.get(actor)?.pending
    return (
        replayStopOutcome(socket, actor, id) ||
        (pending?.episode.owner === socket && pending.request.id === id)
    )
}

export function beginManualStopEpisode(
    socket: RoomSocket,
    actor: GameCharacter
): void {
    if (
        activeEpisode(actor, socket) !== undefined &&
        actors.get(actor)?.pending === undefined
    ) {
        return
    }
    invalidateManualStop(actor)
    const state = actors.get(actor) ?? { credit: STOP_CORRECTION_MAX_DISTANCE }
    state.episode = {
        owner: socket,
        locationId: actor.locationId,
        lifeStartedAt: actor.lifeStartedAt,
        deathSequence: actor.deathSequence,
        trace: [],
    }
    actors.set(actor, state)
}

export function requestManualStop(
    socket: RoomSocket,
    actor: GameCharacter,
    wasMoving: boolean,
    request: StopCorrectionRequest | undefined,
    invalidId: number | undefined,
    now: number
): void {
    const state = actors.get(actor)
    if (wasMoving && request !== undefined && state !== undefined) {
        const anchor = findStopCorrectionAnchor(socket, actor, request)
        const episode = activeEpisode(actor, socket)
        if (
            episode !== undefined &&
            anchor?.episode === episode &&
            now >= anchor.at &&
            now - anchor.at <= STOP_CORRECTION_MAX_AGE_MS
        ) {
            state.pending = {
                request,
                episode,
                receivedAt: now,
                anchorAt: anchor.at,
            }
            return
        }
    }
    if (wasMoving) {
        invalidateManualStop(actor)
    }
    rejectRequest(socket, actor, request?.id ?? invalidId)
}

export function invalidateManualStop(actor: GameCharacter): void {
    const state = actors.get(actor)
    if (state === undefined) {
        return
    }
    const pending = state.pending
    if (pending !== undefined) {
        rejectRequest(pending.episode.owner, actor, pending.request.id)
    }
    delete state.pending
    delete state.episode
}

export function tracksManualStop(actor: GameCharacter): boolean {
    return activeEpisode(actor) !== undefined
}

export function hasPendingManualStop(actor: GameCharacter): boolean {
    return actors.get(actor)?.pending !== undefined
}

export function recordManualStopStep(
    actor: GameCharacter,
    legs: readonly StopCorrectionLeg[],
    permitted: number,
    lastAxis: Vector2,
    lastRemaining: number,
    now: number
): void {
    const state = actors.get(actor)
    const episode = activeEpisode(actor)
    if (state === undefined || episode === undefined) {
        return
    }
    const traveled = legs.reduce(
        (total, leg) => total + distance(leg.from, leg.to),
        0
    )
    state.credit = Math.max(
        0,
        Math.min(
            STOP_CORRECTION_MAX_DISTANCE,
            state.credit + (permitted - traveled)
        )
    )
    episode.trace = episode.trace.filter(
        ({ at }) => now - at <= STOP_CORRECTION_MAX_AGE_MS
    )
    episode.trace.push(...legs)
    episode.forward = { axis: lastAxis, remaining: lastRemaining, at: now }
}

export function applyManualStopCorrection(
    actor: GameCharacter,
    now: number,
    navigation: NavigationService,
    blocked: boolean
): void {
    const state = actors.get(actor)
    const pending = state?.pending
    if (state === undefined || pending === undefined) {
        return
    }
    if (
        blocked ||
        activeEpisode(actor) !== pending.episode ||
        correctionMovementBlocked(actor, now) ||
        hasMovementAxis(actor.getMoveInput()) ||
        !pendingIsFresh(pending, now)
    ) {
        invalidateManualStop(actor)
        return
    }
    const { request, episode } = pending
    const chosen = closestStopPosition(
        actor.position,
        request.position,
        state.credit,
        episode.forward?.at === now ? episode.forward : undefined,
        episode.trace.filter(
            ({ at }) => now - at <= STOP_CORRECTION_MAX_AGE_MS
        ),
        navigation
    )
    state.credit = Math.max(0, state.credit - chosen.cost)
    actor.position = chosen.position
    saveStopOutcome(
        episode.owner,
        actor,
        request.id,
        distance(request.position, chosen.position) < 1e-7
            ? 'accepted'
            : 'clamped'
    )
    delete state.pending
    delete state.episode
}

function pendingIsFresh(pending: PendingStop, now: number): boolean {
    return (
        now >= pending.receivedAt &&
        now - pending.anchorAt <= STOP_CORRECTION_MAX_AGE_MS
    )
}

function correctionMovementBlocked(actor: GameCharacter, now: number): boolean {
    return (
        actor.stunUntil > now ||
        actor.isActionLocked(now) ||
        actor.combat.defensiveStance ||
        actor.movement.dashUntil > now ||
        actor.combat.lunge !== undefined ||
        magicBlocksMovement(actor, now)
    )
}

export function hasMovementAxis(axis: Vector2): boolean {
    return axis.x !== 0 || axis.y !== 0
}

function activeEpisode(
    actor: GameCharacter,
    socket?: RoomSocket
): MovementEpisode | undefined {
    const episode = actors.get(actor)?.episode
    return episode !== undefined &&
        (socket === undefined || socket === episode.owner) &&
        actor.alive &&
        actor.connected &&
        !actor.tags.has('offline') &&
        actor.soul.controlSource === 'human' &&
        actor.locationId === episode.locationId &&
        actor.lifeStartedAt === episode.lifeStartedAt &&
        actor.deathSequence === episode.deathSequence
        ? episode
        : undefined
}

function rejectRequest(
    socket: RoomSocket,
    actor: GameCharacter,
    id: number | undefined
): void {
    if (id !== undefined) {
        saveStopOutcome(socket, actor, id, 'rejected')
    }
}
