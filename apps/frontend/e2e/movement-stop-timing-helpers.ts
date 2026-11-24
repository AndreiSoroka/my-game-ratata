import type {
    CharacterSnapshot,
    ClientMessage,
    ServerMessage,
    Vector2,
} from '@my-game-ratata/contracts'
import type { Page } from '@playwright/test'

import { RuntimeSnapshotStream } from '../src/game/runtime/runtimeSnapshotStream'

export interface StopWireFrame {
    tick: number
    serverTime: number
    stepMs: number
    afterRelease: boolean
    position: Vector2
    velocity: Vector2
    continuationUntil?: number
}

export function movementKey(axis: Vector2): string {
    if (axis.x !== 0) return axis.x > 0 ? 'KeyD' : 'KeyA'
    return axis.y > 0 ? 'KeyS' : 'KeyW'
}

export async function captureStopWire(page: Page) {
    const snapshots = new RuntimeSnapshotStream(true)
    const frames: StopWireFrame[] = []
    const commands: ClientMessage[] = []
    let playerId: string | undefined
    let held = false
    let afterRelease = false
    await page.routeWebSocket(/\/ws$/, (client) => {
        const server = client.connectToServer()
        client.onMessage((raw) => {
            const message = JSON.parse(raw.toString()) as ClientMessage
            commands.push(message)
            if (message.type === 'move_input') {
                if (message.axis.x !== 0 || message.axis.y !== 0) {
                    held = true
                    afterRelease = false
                } else if (held) {
                    afterRelease = true
                    held = false
                }
            }
            server.send(raw)
        })
        server.onMessage((raw) => {
            const message = JSON.parse(raw.toString()) as ServerMessage
            if (message.type === 'world_init') playerId = message.playerId
            const receipt =
                message.type === 'world_init'
                    ? snapshots.initialize(message)
                    : message.type === 'snapshot' || message.type === 'snapshot_delta'
                      ? snapshots.receive(message)
                      : undefined
            if (receipt?.kind === 'applied') {
                const { snapshot } = receipt
                const actor = snapshot.characters.find((character) => character.id === playerId)
                if (actor) frames.push(wireFrame(actor, snapshot, afterRelease))
            } else if (receipt && receipt.kind !== 'ignored')
                throw new Error('Invalid authoritative motion stream')
            client.send(raw)
        })
    })
    return { frames, commands }
}

function wireFrame(
    actor: CharacterSnapshot,
    snapshot: { tick: number; serverTime: number; stepMs?: number },
    afterRelease: boolean
): StopWireFrame {
    return {
        tick: snapshot.tick,
        serverTime: snapshot.serverTime,
        stepMs: snapshot.stepMs ?? 0,
        afterRelease,
        position: { ...actor.position },
        velocity: { ...actor.velocity },
        continuationUntil: actor.movement?.continuationUntil,
    }
}

export interface StopRenderFrame {
    at: number
    tick: number
    serverTime: number
    position: Vector2
    velocity: Vector2
    rendered: Vector2
    pagePosition: Vector2
    continuationUntil?: number
}

export function captureStopRendering(page: Page) {
    return page.evaluate(async (): Promise<StopRenderFrame[]> => {
        const frames: StopRenderFrame[] = []
        const started = performance.now()
        while (performance.now() - started < 650) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            const state = window.__ratataTest!.getState()
            const debug = window.__ratataGameDebug!
            const actor = state.player!
            const rendered = debug.renderedCharacters!().find(
                (character) => character.id === actor.id
            )!.position
            frames.push({
                at: performance.now() - started,
                tick: state.snapshot!.tick,
                serverTime: state.snapshot!.serverTime,
                position: { ...actor.position },
                velocity: { ...actor.velocity },
                rendered,
                pagePosition: debug.worldToPage(rendered)!,
                continuationUntil: actor.movement?.continuationUntil,
            })
        }
        return frames
    })
}

export function backwardMotionMetrics(frames: StopRenderFrame[], axis: Vector2) {
    let backwardWorldPixels = 0,
        maxBackwardWorldPixels = 0
    for (let index = 1; index < frames.length; index += 1) {
        const previous = frames[index - 1]!.rendered,
            next = frames[index]!.rendered
        const backward = Math.max(
            0,
            (previous.x - next.x) * axis.x + (previous.y - next.y) * axis.y
        )
        backwardWorldPixels += backward
        maxBackwardWorldPixels = Math.max(maxBackwardWorldPixels, backward)
    }
    return {
        backwardWorldPixels,
        maxBackwardWorldPixels,
        maximumAuthorityGap: Math.max(
            ...frames.map((frame) =>
                Math.hypot(frame.position.x - frame.rendered.x, frame.position.y - frame.rendered.y)
            )
        ),
    }
}

export function isEndedPartialStep(
    frame: Pick<StopWireFrame, 'velocity' | 'serverTime' | 'continuationUntil'>
): boolean {
    return (
        Math.hypot(frame.velocity.x, frame.velocity.y) > 0 &&
        frame.continuationUntil !== undefined &&
        frame.continuationUntil <= frame.serverTime
    )
}
