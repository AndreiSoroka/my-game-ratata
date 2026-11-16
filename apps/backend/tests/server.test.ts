import { CONTRACT_PROTOCOL_VERSION } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { createFetchHandler } from '../src/server'

describe('backend health endpoint', () => {
    it('returns the shared contract protocol version', async () => {
        const response = await createFetchHandler()(
            new Request('http://localhost/health')
        )
        expectResponse(response)

        expect(response.status).toBe(200)
        await expect(response.text()).resolves.toContain(
            CONTRACT_PROTOCOL_VERSION
        )
    })

    it('returns 404 for unknown routes', async () => {
        const response = await createFetchHandler()(
            new Request('http://localhost/missing')
        )
        expectResponse(response)

        expect(response.status).toBe(404)
    })
})

function expectResponse(
    response: Response | undefined
): asserts response is Response {
    expect(response).toBeDefined()
}
