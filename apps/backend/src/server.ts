import {
    CONTRACT_PROTOCOL_VERSION,
    type GameReadiness,
    type ServiceHealth,
} from '@my-game-ratata/contracts'
import type { ServerWebSocket } from 'bun'

import { handleAgentRequest } from './agentBridge'
import type { GameRoom } from './game/room'
import type { RoomSocketData } from './game/roomMessaging'
import type { WorldAdmin } from './worldAdmin'
import { worldMapResponse } from './worldMapResponse'

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
) => Response | undefined | Promise<Response>

type RoomRef = GameRoom | (() => GameRoom | undefined)

interface ServerOptions {
    readiness?: () => GameReadiness['state']
    admin?: WorldAdmin
    tls?: boolean
}

function activeRoom(ref?: RoomRef): GameRoom | undefined {
    return typeof ref === 'function' ? ref() : ref
}

export function createFetchHandler(
    ref?: RoomRef,
    options: ServerOptions = {}
): FetchHandler {
    return (request, server) => {
        const url = new URL(request.url)
        const room = activeRoom(ref)

        if (url.pathname.startsWith('/world/maps/')) {
            return worldMapResponse(request, room)
        }

        if (url.pathname.startsWith('/agent/')) {
            return handleAgentRequest(request, room)
        }

        if (url.pathname === '/health') {
            return Response.json(createHealthResponse(), {
                headers: jsonHeaders,
            })
        }

        if (url.pathname === '/ready') {
            return readinessResponse(
                request.method,
                readReadiness(room, options.readiness)
            )
        }

        if (url.pathname.startsWith('/admin/') && options.admin !== undefined) {
            return options.admin.handle(request, {
                ingress: 'public',
                peer: server?.requestIP(request)?.address,
                tls: options.tls === true,
            })
        }

        if (url.pathname === '/ws') {
            return websocketResponse(request, server, room, options.readiness)
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

function readReadiness(
    room: GameRoom | undefined,
    readiness: ServerOptions['readiness']
): GameReadiness['state'] {
    return readiness?.() ?? (room === undefined ? 'checking' : 'ready')
}

function websocketResponse(
    request: Request,
    server: Bun.Server<RoomSocketData> | undefined,
    room: GameRoom | undefined,
    readiness: ServerOptions['readiness']
): Response | undefined {
    if (room === undefined && readiness !== undefined) {
        return readinessResponse('GET', readiness())
    }
    return upgradeWebSocket(request, server, room)
}

export function createWebSocketHandlers(
    ref: RoomRef
): Bun.WebSocketHandler<RoomSocketData> {
    return {
        close(ws) {
            activeRoom(ref)?.handleClose(ws)
        },
        data: {} as RoomSocketData,
        message(ws, message) {
            activeRoom(ref)?.handleMessage(ws, message)
        },
        open(ws) {
            activeRoom(ref)?.handleOpen(ws)
        },
    }
}

function readinessResponse(
    method: string,
    state: GameReadiness['state']
): Response {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
    }
    if (method !== 'GET') {
        return new Response(null, {
            status: 405,
            headers: { ...headers, Allow: 'GET' },
        })
    }
    return Response.json({ state } satisfies GameReadiness, {
        headers,
        status: state === 'ready' ? 200 : 503,
    })
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
