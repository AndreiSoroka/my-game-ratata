import { CONTRACT_PROTOCOL_VERSION } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { projectMovementPresentation } from './movementPresentation'
import type { JoinContext } from './roomIdentity'
import { type RoomSocket, sendSnapshot, sendWorldInit } from './roomMessaging'
import type { SimulationContext } from './roomSimulation'
import { socketViewport } from './roomViewport'
import {
    recordStopCorrectionAnchor,
    resetStopCorrectionStream,
} from './stopCorrection'
import { ownerStopCorrection } from './stopCorrectionJournal'
import { projectViewport } from './viewportProjection'

export function publishRoomSnapshots(
    context: SimulationContext,
    motionDeadlines: ReadonlyMap<string, number>
): void {
    for (const [ws, id] of context.connections) {
        if (id === undefined) {
            continue
        }
        const actor = context.characters.get(id)
        const locationId = actor?.locationId
        const viewport = socketViewport(ws, id, locationId)
        sendSnapshot(
            ws,
            () => {
                const snapshot = projectMovementPresentation(
                    projectViewport(
                        context.snapshot(context.now, locationId, id),
                        viewport,
                        id
                    ),
                    motionDeadlines
                )
                const receipt =
                    actor === undefined
                        ? undefined
                        : ownerStopCorrection(ws, actor)
                return receipt === undefined
                    ? snapshot
                    : { ...snapshot, stopCorrection: receipt }
            },
            {
                playerId: id,
                stepMs: context.deltaMs,
                clockResumeRevision: context.room.clockResumeRevision(),
                ...(actor === undefined
                    ? {}
                    : {
                          onSent: (reference, at) =>
                              recordStopCorrectionAnchor(
                                  ws,
                                  actor,
                                  reference,
                                  at
                              ),
                      }),
            }
        )
    }
}

export function sendInitialRoomState(
    context: Pick<
        JoinContext,
        'mapFor' | 'snapshotFor' | 'tickMs' | 'clockResumeRevision'
    >,
    socket: RoomSocket,
    character: GameCharacter
): boolean {
    resetStopCorrectionStream(socket, character)
    return sendWorldInit(
        socket,
        {
            map: context.mapFor(character),
            playerId: character.id,
            protocolVersion: CONTRACT_PROTOCOL_VERSION,
            snapshot: context.snapshotFor(character),
            tickMs: context.tickMs,
            type: 'world_init',
        },
        {
            clockResumeRevision: context.clockResumeRevision?.() ?? 0,
            onSent: (reference, at) =>
                recordStopCorrectionAnchor(socket, character, reference, at),
        }
    )
}
