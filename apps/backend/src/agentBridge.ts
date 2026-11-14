import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

import type { GameRoom } from './game/room'

/** Optional local model-control port. Disabled unless the process has a token. */
export async function handleAgentRequest(
    request: Request,
    room: GameRoom | undefined,
    token = process.env['GAME_AGENT_TOKEN']
): Promise<Response> {
    if (!validToken(token) || room === undefined) {
        return Response.json(
            { error: 'Agent bridge is disabled' },
            { status: 404 }
        )
    }
    if (
        request.headers.get('authorization') !== `Bearer ${token}` ||
        request.headers.has('origin')
    ) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = new URL(request.url)
    if (url.pathname === '/agent/state' && request.method === 'GET') {
        return observeState(url, room)
    }
    if (url.pathname === '/agent/act' && request.method === 'POST') {
        return handleAction(request, room)
    }
    return Response.json(
        { error: 'Unknown agent route or method' },
        { status: 404 }
    )
}

async function handleAction(
    request: Request,
    room: GameRoom
): Promise<Response> {
    const text = await request.text()
    if (text.length > 4096) {
        return Response.json({ error: 'Action is too large' }, { status: 413 })
    }
    let input: unknown
    try {
        input = JSON.parse(text) as unknown
    } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    if (
        input === null ||
        typeof input !== 'object' ||
        !('actorId' in input) ||
        typeof input.actorId !== 'string' ||
        !('decision' in input)
    ) {
        return Response.json(
            { error: 'actorId and decision are required' },
            { status: 400 }
        )
    }
    const result = room.decideForAgent(input.actorId, input.decision)
    return Response.json(result, { status: result.accepted ? 200 : 400 })
}

function validToken(token: string | undefined): token is string {
    return token !== undefined && token.length >= 24
}

function observeActor(url: URL, room: GameRoom): Response | undefined {
    const actorId = url.searchParams.get('actorId')
    if (actorId === null) {
        return undefined
    }
    const actor = room.getCharacter(actorId)
    if (
        actor === undefined ||
        actor.controllerKind === 'network_player' ||
        actor.soul.controlSource === 'human'
    ) {
        return Response.json(
            { error: 'Only existing NPCs may be observed privately' },
            { status: 400 }
        )
    }
    return Response.json(room.snapshot(Date.now(), actor.locationId, actor.id))
}

function observeState(url: URL, room: GameRoom): Response {
    const actor = observeActor(url, room)
    if (actor !== undefined) {
        return actor
    }
    const location = url.searchParams.get('locationId') ?? CENTER_LOCATION_ID
    if (!room.hasLocation(location)) {
        return Response.json({ error: 'Unknown location' }, { status: 400 })
    }
    return Response.json(room.snapshot(Date.now(), location))
}
