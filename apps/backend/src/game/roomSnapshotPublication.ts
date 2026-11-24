import { CONTRACT_PROTOCOL_VERSION } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { projectMovementPresentation } from './movementPresentation'
import type { JoinContext } from './roomIdentity'
import { type RoomSocket, sendSnapshot, sendWorldInit } from './roomMessaging'
import type { SimulationContext } from './roomSimulation'
import { socketViewport } from './roomViewport'
import { projectViewport } from './viewportProjection'

export function publishRoomSnapshots(
    context: SimulationContext,
    motionDeadlines: ReadonlyMap<string, number>
): void {
    for (const [ws, id] of context.connections) {
        if (id === undefined) {
            continue
        }
        const locationId = context.characters.get(id)?.locationId
        const viewport = socketViewport(ws, id, locationId)
        sendSnapshot(
            ws,
            () =>
                projectMovementPresentation(
                    projectViewport(
                        context.snapshot(context.now, locationId, id),
                        viewport,
                        id
                    ),
                    motionDeadlines
                ),
            {
                playerId: id,
                stepMs: context.deltaMs,
                clockResumeRevision: context.room.clockResumeRevision(),
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
        { clockResumeRevision: context.clockResumeRevision?.() ?? 0 }
    )
}
