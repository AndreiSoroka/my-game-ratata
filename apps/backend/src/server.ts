import {
    CONTRACT_PROTOCOL_VERSION,
    type ServiceHealth,
} from '@my-game-ratata/contracts'
import type { ServerWebSocket } from 'bun'

import type { GameRoom, RoomSocketData } from './game/room'

const jsonHeaders = {
    'content-type': 'application/json; charset=utf-8',
} as const

export function createHealthResponse(checkedAt = new Date()): ServiceHealth {
    return {
        checkedAt: checkedAt.toISOString(),
        protocolVersion: CONTRACT_PROTOCOL_VERSION,
        service: 'backend',
        status: 'ok',
    }
}

type FetchHandler = (
    request: Request,
    server?: Bun.Server<RoomSocketData>
) => Response | undefined

export function createFetchHandler(room?: GameRoom): FetchHandler {
    return (request, server) => {
        const url = new URL(request.url)

        if (url.pathname === '/health') {
            return Response.json(createHealthResponse(), {
                headers: jsonHeaders,
            })
        }

        if (url.pathname === '/ws') {
            return upgradeWebSocket(request, server, room)
        }

        return Response.json(
            {
                error: 'Not found',
            },
            {
                headers: jsonHeaders,
                status: 404,
            }
        )
    }
}

export function createWebSocketHandlers(
    room: GameRoom
): Bun.WebSocketHandler<RoomSocketData> {
    return {
        close(ws) {
            room.handleClose(ws)
        },
        data: {} as RoomSocketData,
        message(ws, message) {
            room.handleMessage(ws, message)
        },
        open(ws) {
            room.handleOpen(ws)
        },
    }
}

function upgradeWebSocket(
    request: Request,
    server: Bun.Server<RoomSocketData> | undefined,
    room: GameRoom | undefined
): Response | undefined {
    if (server === undefined || room === undefined) {
        return Response.json(
            { error: 'WebSocket server is not available' },
            { headers: jsonHeaders, status: 426 }
        )
    }

    const upgraded = server.upgrade(request, {
        data: { socketId: crypto.randomUUID() },
    })

    if (upgraded) {
        return undefined
    }

    return Response.json(
        { error: 'WebSocket upgrade failed' },
        { headers: jsonHeaders, status: 400 }
    )
}

export type RoomServerWebSocket = ServerWebSocket<RoomSocketData>
