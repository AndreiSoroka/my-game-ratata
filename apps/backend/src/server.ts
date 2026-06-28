import {
    CONTRACT_PROTOCOL_VERSION,
    type ServiceHealth,
} from '@my-game-ratata/contracts'

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

export function createFetchHandler(): (request: Request) => Response {
    return (request) => {
        const url = new URL(request.url)

        if (url.pathname === '/health') {
            return Response.json(createHealthResponse(), {
                headers: jsonHeaders,
            })
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
