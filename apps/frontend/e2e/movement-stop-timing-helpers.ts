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

const stopSampleMs = 1_300

export function movementKey(axis: Vector2): string {
    if (axis.x !== 0) {
        return axis.x > 0 ? 'KeyD' : 'KeyA'
    }
    return axis.y > 0 ? 'KeyS' : 'KeyW'
}

/** Delay probes and game traffic on the same FIFO link in each direction. */
export async function captureStopWire(
    page: Page,
    {
        uplinkMs,
        downlinkMs,
        calibration,
    }: {
        uplinkMs: number
        downlinkMs: number
        calibration: boolean
    }
) {
    const frames: StopWireFrame[] = []
    const requests: StopWireRequest[] = []
    let deliveredPongs = 0
    await page.routeWebSocket(/\/ws$/, (client) => {
        const snapshots = new RuntimeSnapshotStream(true)
        let playerId: string | undefined
        const server = client.connectToServer()
        const uplink = delayedLink(uplinkMs)
        const downlink = delayedLink(downlinkMs)
        client.onMessage((raw) => {
            const message = JSON.parse(raw.toString()) as ClientMessage
            if (message.type === 'move_input' && message.stopCorrection) {
                requests.push({
                    ...message.stopCorrection,
                    axis: message.axis,
                    emittedAt: performance.now(),
                })
            }
            uplink.enqueue(() => server.send(raw))
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
            if (message.type === 'motion_pong' && !calibration) return
            downlink.enqueue(() => {
                if (message.type === 'motion_pong') deliveredPongs += 1
                client.send(raw)
            })
        })
        client.onClose((code, reason) => {
            uplink.clear()
            downlink.clear()
            server.close({ code, reason })
        })
        server.onClose((code, reason) => {
            uplink.clear()
            downlink.clear()
            client.close({ code, reason })
        })
    })
    return { frames, requests, deliveredPongs: () => deliveredPongs }
}

function delayedLink(delay: number) {
    const queue: { delivery: number; send: () => void }[] = []
    let timer: ReturnType<typeof setTimeout> | undefined

    function schedule(): void {
        const first = queue[0]
        if (first === undefined) return
        timer = setTimeout(flush, Math.max(0, Math.ceil(first.delivery - performance.now())))
    }

    function flush(): void {
        timer = undefined
        const now = performance.now()
        while (queue[0] && queue[0].delivery <= now) {
            queue.shift()!.send()
        }
        schedule()
    }

    return {
        enqueue(send: () => void) {
            queue.push({ delivery: performance.now() + delay, send })
            if (timer === undefined) schedule()
        },
        clear() {
            clearTimeout(timer)
            timer = undefined
            queue.length = 0
        },
    }
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
    drawnReference?: Pick<StopCorrectionRequest, 'streamId' | 'seq'>
}

export function captureStopRendering(page: Page, key: string) {
    return page.evaluate(
        async ({ code, duration }): Promise<StopRenderFrame[]> => {
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
            while (performance.now() - started < duration) {
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
                frames.push(readFrame(performance.now() - started))
            }
            return frames

            function readFrame(at: number): StopRenderFrame {
                const state = window.__ratataTest!.getState()
                const actor = state.player!
                const debug = window.__ratataGameDebug!
                const drawn = at === 0 ? debug.lastDrawnOwnerPose?.() : undefined
                const rendered =
                    drawn?.position ??
                    debug.renderedCharacters!().find((character) => character.id === actor.id)!
                        .position
                return {
                    at,
                    tick: state.snapshot!.tick,
                    position: { ...actor.position },
                    rendered: { ...rendered },
                    stopCorrection: state.snapshot!.stopCorrection,
                    ...(drawn === undefined
                        ? {}
                        : { drawnReference: { streamId: drawn.streamId, seq: drawn.seq } }),
                }
            }
        },
        { code: key, duration: stopSampleMs }
    )
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
    const beforeCorrection = {
        x: previous.position.x + endpoint.velocity.x,
        y: previous.position.y + endpoint.velocity.y,
    }
    return {
        endpoint,
        previousTick: previous.tick,
        acknowledgementMs,
        beforeCorrection,
        appliedCorrectionPx: distance(endpoint.position, beforeCorrection),
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
