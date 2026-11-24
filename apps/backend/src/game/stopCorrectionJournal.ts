import type {
    StopCorrectionReceipt,
    StopCorrectionRequest,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { RoomSocket } from './roomMessaging'

export type SnapshotReference = Pick<StopCorrectionRequest, 'streamId' | 'seq'>
type Result = StopCorrectionReceipt['status']

interface Anchor extends SnapshotReference {
    episode: object | undefined
    at: number
}

interface SocketCorrectionState {
    actor: GameCharacter
    anchors: Anchor[]
    outcomes: Map<number, Result>
    outgoing: StopCorrectionReceipt[]
    receipt?: StopCorrectionReceipt
}

const sockets = new WeakMap<RoomSocket, SocketCorrectionState>()
const anchorCount = 8
const receiptCount = 128

function socketState(
    socket: RoomSocket,
    actor: GameCharacter
): SocketCorrectionState {
    const existing = sockets.get(socket)
    if (existing?.actor === actor) {
        return existing
    }
    const state: SocketCorrectionState = {
        actor,
        anchors: [],
        outcomes: new Map(),
        outgoing: [],
    }
    sockets.set(socket, state)
    return state
}

export function clearStopCorrectionAnchors(socket: RoomSocket): void {
    sockets.delete(socket)
}

export function publishStopCorrectionAnchor(
    socket: RoomSocket,
    actor: GameCharacter,
    reference: SnapshotReference,
    at: number,
    episode: object | undefined
): void {
    const state = socketState(socket, actor)
    const previous = state.anchors.at(-1)
    if (previous !== undefined && previous.streamId !== reference.streamId) {
        state.anchors = []
    }
    state.anchors.push({ ...reference, episode, at })
    if (state.anchors.length > anchorCount) {
        state.anchors.shift()
    }
    const receipt = state.outgoing.shift()
    if (receipt !== undefined) {
        state.receipt = receipt
    }
}

export function findStopCorrectionAnchor(
    socket: RoomSocket,
    actor: GameCharacter,
    { seq, streamId }: SnapshotReference
): Anchor | undefined {
    return socketState(socket, actor).anchors.find(
        (frame) => frame.streamId === streamId && frame.seq === seq
    )
}

export function ownerStopCorrection(
    socket: RoomSocket,
    actor: GameCharacter
): StopCorrectionReceipt | undefined {
    const state = socketState(socket, actor)
    return state.outgoing[0] ?? state.receipt
}

export function replayStopOutcome(
    socket: RoomSocket,
    actor: GameCharacter,
    id: number
): boolean {
    const state = socketState(socket, actor)
    const previous = state.outcomes.get(id)
    if (previous === undefined) {
        return false
    }
    queueReceipt(state, id, previous)
    return true
}

export function saveStopOutcome(
    socket: RoomSocket,
    actor: GameCharacter,
    id: number,
    status: Result
): void {
    const state = socketState(socket, actor)
    state.outcomes.set(id, status)
    if (state.outcomes.size > receiptCount) {
        const oldest = state.outcomes.keys().next()
        if (oldest.value !== undefined) {
            state.outcomes.delete(oldest.value)
        }
    }
    queueReceipt(state, id, status)
}

function queueReceipt(
    state: SocketCorrectionState,
    id: number,
    status: Result
): void {
    if (state.outgoing.some((receipt) => receipt.id === id)) {
        return
    }
    if (state.outgoing.length >= receiptCount) {
        state.outgoing.shift()
    }
    state.outgoing.push({ id, status })
}
