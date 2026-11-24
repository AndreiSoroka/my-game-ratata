import {
    type CharacterSnapshot,
    type ClientMessage,
    type ServerMessage,
    STOP_CORRECTION_BLEND_MS,
    STOP_CORRECTION_MAX_AGE_MS,
    type StopCorrectionReceipt,
    type StopCorrectionRequest,
    type Vector2,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import type { Page } from '@playwright/test'

import { RuntimeSnapshotStream } from '../src/game/runtime/runtimeSnapshotStream'

export interface StopWireFrame {
    streamId: number
    seq: number
    tick: number
    serverTime: number
    receivedAt: number
    position: Vector2
    velocity: Vector2
    stopCorrection?: StopCorrectionReceipt
}

interface StopWireRequest extends StopCorrectionRequest {
    axis: Vector2
    emittedAt: number
}

export function movementKey(axis: Vector2): string {
    if (axis.x !== 0) {
        return axis.x > 0 ? 'KeyD' : 'KeyA'
    }
    return axis.y > 0 ? 'KeyS' : 'KeyW'
}

/** Add stop round-trip latency while preserving authoritative snapshot order. */
export async function captureStopWire(
    page: Page,
    { releaseDelayMs, receiptDelayMs }: { releaseDelayMs: number; receiptDelayMs: number }
) {
    const snapshots = new RuntimeSnapshotStream(true)
    const frames: StopWireFrame[] = []
    const requests: StopWireRequest[] = []
    const queued: (() => void)[] = []
    let playerId: string | undefined
    let waitingFor: number | undefined
    await page.routeWebSocket(/\/ws$/, (client) => {
        const server = client.connectToServer()
        client.onMessage((raw) => {
            const message = JSON.parse(raw.toString()) as ClientMessage
            if (message.type === 'move_input' && message.stopCorrection) {
                requests.push({
                    ...message.stopCorrection,
                    axis: message.axis,
                    emittedAt: performance.now(),
                })
                waitingFor = message.stopCorrection.id
                setTimeout(() => server.send(raw), releaseDelayMs)
                return
            }
            server.send(raw)
        })
        server.onMessage((raw) => {
            const message = JSON.parse(raw.toString()) as ServerMessage
            if (message.type === 'world_init') {
                playerId = message.playerId
            }
            const frame = receiveStopFrame(snapshots, message, playerId)
            if (frame) {
                frames.push(frame)
            }
            if (waitingFor !== undefined && frame?.stopCorrection?.id === waitingFor) {
                waitingFor = undefined
                setTimeout(() => {
                    for (const send of queued.splice(0)) {
                        send()
                    }
                }, receiptDelayMs)
                queued.push(() => client.send(raw))
                return
            }
            if (queued.length > 0) {
                queued.push(() => client.send(raw))
            } else {
                client.send(raw)
            }
        })
    })
    return { frames, requests }
}

function receiveStopFrame(
    stream: RuntimeSnapshotStream,
    message: ServerMessage,
    playerId?: string
): StopWireFrame | undefined {
    if (!('seq' in message)) {
        return undefined
    }
    const receipt =
        message.type === 'world_init' ? stream.initialize(message) : stream.receive(message)
    if (receipt.kind === 'resync') {
        throw new Error('Invalid authoritative motion stream')
    }
    if (receipt.kind === 'applied') {
        const actor = receipt.snapshot.characters.find((character) => character.id === playerId)
        if (actor) {
            return wireFrame(actor, receipt.snapshot, message)
        }
    }
    return undefined
}

function wireFrame(
    actor: CharacterSnapshot,
    snapshot: WorldSnapshot,
    { streamId, seq }: Pick<StopCorrectionRequest, 'streamId' | 'seq'>
): StopWireFrame {
    return {
        streamId,
        seq,
        tick: snapshot.tick,
        serverTime: snapshot.serverTime,
        receivedAt: performance.now(),
        position: { ...actor.position },
        velocity: { ...actor.velocity },
        stopCorrection: snapshot.stopCorrection,
    }
}

export interface StopRenderFrame {
    at: number
    tick: number
    position: Vector2
    rendered: Vector2
    stopCorrection?: StopCorrectionReceipt
}

export function captureStopRendering(page: Page, key: string) {
    return page.evaluate(async (code): Promise<StopRenderFrame[]> => {
        const frames: StopRenderFrame[] = []
        const started = await new Promise<number>((resolve) => {
            const capture = (event: KeyboardEvent) => {
                if (event.code !== code) {
                    return
                }
                window.removeEventListener('keyup', capture, true)
                const releasedAt = performance.now()
                frames.push(readFrame(0))
                resolve(releasedAt)
            }
            window.addEventListener('keyup', capture, true)
        })
        while (performance.now() - started < 1_300) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            frames.push(readFrame(performance.now() - started))
        }
        return frames

        function readFrame(at: number): StopRenderFrame {
            const state = window.__ratataTest!.getState()
            const actor = state.player!
            const rendered = window.__ratataGameDebug!.renderedCharacters!().find(
                (character) => character.id === actor.id
            )!.position
            return {
                at,
                tick: state.snapshot!.tick,
                position: { ...actor.position },
                rendered: { ...rendered },
                stopCorrection: state.snapshot!.stopCorrection,
            }
        }
    }, key)
}

export function distance(a: Vector2, b: Vector2): number {
    return Math.hypot(a.x - b.x, a.y - b.y)
}

export function readStopResult(
    frames: StopRenderFrame[],
    sent: StopWireFrame[],
    request: StopCorrectionRequest,
    tolerance: number
) {
    const endIndex = sent.findIndex((frame) => frame.stopCorrection?.id === request.id)
    const acknowledged = frames.find((frame) => frame.stopCorrection?.id === request.id)
    if (endIndex < 1 || !acknowledged) {
        throw new Error('No matching stop receipt in the snapshot stream and rendered frames')
    }
    const endpoint = sent[endIndex]!
    const previous = sent[endIndex - 1]!
    const acknowledgementMs = acknowledged.at
    const heldUntil = Math.min(acknowledgementMs, STOP_CORRECTION_MAX_AGE_MS)
    const settled = frames.find(
        (frame) =>
            frame.at >= acknowledgementMs && distance(frame.rendered, endpoint.position) < tolerance
    )
    const fallback = frames.find(
        (frame) => frame.at >= STOP_CORRECTION_MAX_AGE_MS && frame.at < acknowledgementMs
    )
    const convergenceDeadline = frames.find(
        (frame) => frame.at >= acknowledgementMs + STOP_CORRECTION_BLEND_MS
    )
    // Velocity reports ordinary movement before the separate stop correction.
    const appliedCorrectionPx = distance(endpoint.position, {
        x: previous.position.x + endpoint.velocity.x,
        y: previous.position.y + endpoint.velocity.y,
    })
    return {
        endpoint,
        previousTick: previous.tick,
        acknowledgementMs,
        appliedCorrectionPx,
        settledMs: settled?.at,
        convergenceMs: settled && settled.at - acknowledgementMs,
        frozenGapPx: distance(request.position, endpoint.position),
        held: frames.filter((frame) => frame.at > 0 && frame.at < heldUntil),
        fallbackError: fallback ? distance(fallback.rendered, fallback.position) : 0,
        convergenceError: convergenceDeadline
            ? distance(convergenceDeadline.rendered, endpoint.position)
            : Infinity,
        stationaryFrames: sent.slice(endIndex + 1),
    }
}
