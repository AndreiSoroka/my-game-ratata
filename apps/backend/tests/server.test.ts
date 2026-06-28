import { CONTRACT_PROTOCOL_VERSION } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { createFetchHandler } from '../src/server'

describe('backend health endpoint', () => {
    it('returns the shared contract protocol version', async () => {
        const response = createFetchHandler()(
            new Request('http://localhost/health')
        )

        expect(response.status).toBe(200)
        await expect(response.text()).resolves.toContain(
            CONTRACT_PROTOCOL_VERSION
        )
    })

    it('returns 404 for unknown routes', () => {
        const response = createFetchHandler()(
            new Request('http://localhost/missing')
        )

        expect(response.status).toBe(404)
    })
})
