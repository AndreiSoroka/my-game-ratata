import type { GameRoom } from './game/room'

const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, HEAD, OPTIONS',
    'content-type': 'application/json; charset=utf-8',
}

/** Public world geometry is immutable for an epoch and contains no live or private actor state. */
export function worldMapResponse(request: Request, room?: GameRoom): Response {
    const url = new URL(request.url)
    const match =
        /^\/world\/maps\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\.json$/u.exec(
            url.pathname
        )
    const epoch = match?.[1],
        locationId = match?.[2]
    const asset =
        epoch === undefined || locationId === undefined
            ? undefined
            : room?.worldMapAsset(epoch, locationId)
    if (asset === undefined) {
        return Response.json(
            { error: 'World map is not available for this epoch' },
            {
                status: 404,
                headers: { ...headers, 'cache-control': 'no-store' },
            }
        )
    }
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return Response.json(
            { error: 'Method not allowed' },
            {
                status: 405,
                headers: { ...headers, allow: 'GET, HEAD, OPTIONS' },
            }
        )
    }
    const cache = {
        ...headers,
        etag: `"${asset.revision}"`,
        'cache-control': 'public, max-age=31536000, immutable',
    }
    if (request.headers.get('if-none-match') === cache.etag) {
        return new Response(null, { status: 304, headers: cache })
    }
    return new Response(request.method === 'HEAD' ? null : asset.body, {
        headers: cache,
    })
}
