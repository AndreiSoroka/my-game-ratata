import { describe, expect, it } from 'vitest'

import { handleAgentRequest } from '../src/agentBridge'
import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'

const token = 'local-test-token-longer-than-24-characters'
const room = new GameRoom(
    new NavigationService({
        id: 'agent-test',
        width: 96,
        height: 80,
        tileWidth: 16,
        tileHeight: 16,
        solid: new Array<boolean>(96 * 80).fill(false),
        solidLayerNames: [],
    })
)

function request(
    path: string,
    body?: unknown,
    headers: Record<string, string> = {}
) {
    return new Request(`http://localhost${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${token}`, ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
}

describe('private NPC observation', () => {
    it('allows private observation only for the chosen existing NPC', async () => {
        const response = await handleAgentRequest(
            request('/agent/state?actorId=npc_smith_1'),
            room,
            token
        )
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            adventure: { market: { cityName: 'Новогород' } },
        })
        expect(
            (
                await handleAgentRequest(
                    request('/agent/state?actorId=missing'),
                    room,
                    token
                )
            ).status
        ).toBe(400)
    })
})

describe('optional local NPC control bridge', () => {
    it('is disabled without a sufficiently long local token', async () => {
        expect(
            (await handleAgentRequest(request('/agent/state'), room, '')).status
        ).toBe(404)
    })

    it('rejects missing credentials and browser-origin requests', async () => {
        expect(
            (
                await handleAgentRequest(
                    new Request('http://localhost/agent/state'),
                    room,
                    token
                )
            ).status
        ).toBe(401)
        expect(
            (
                await handleAgentRequest(
                    request('/agent/state', undefined, {
                        origin: 'https://unrelated.example',
                    }),
                    room,
                    token
                )
            ).status
        ).toBe(401)
    })

    it('observes only valid locations without mutating the world', async () => {
        const response = await handleAgentRequest(
            request('/agent/state?locationId=map-0-0'),
            room,
            token
        )
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            location: { id: 'map-0-0' },
        })
        expect(
            (
                await handleAgentRequest(
                    request('/agent/state?locationId=map-9-9'),
                    room,
                    token
                )
            ).status
        ).toBe(400)
    })

    it('defaults observations to Novogorod rather than the former center', async () => {
        const response = await handleAgentRequest(
            request('/agent/state'),
            room,
            token
        )
        expect(await response.json()).toMatchObject({
            location: { id: 'map-2-2', name: 'Новогород', columns: 5, rows: 5 },
        })
    })

    it('rejects nonexistent actors and invalid decision payloads', async () => {
        expect(
            (
                await handleAgentRequest(
                    request('/agent/act', {
                        actorId: 'missing',
                        decision: { type: 'wait' },
                    }),
                    room,
                    token
                )
            ).status
        ).toBe(400)
        expect(
            (
                await handleAgentRequest(
                    request('/agent/act', {
                        actorId: 'npc_slime_1',
                        decision: { type: 'teleport' },
                    }),
                    room,
                    token
                )
            ).status
        ).toBe(400)
    })

    it('rejects unsupported routes, malformed JSON and oversized decisions', async () => {
        expect(
            (await handleAgentRequest(request('/agent/act'), room, token))
                .status
        ).toBe(404)
        const malformed = new Request('http://localhost/agent/act', {
            method: 'POST',
            headers: { authorization: `Bearer ${token}` },
            body: '{',
        })
        expect((await handleAgentRequest(malformed, room, token)).status).toBe(
            400
        )
        expect(
            (
                await handleAgentRequest(
                    request('/agent/act', { text: 'a'.repeat(5000) }),
                    room,
                    token
                )
            ).status
        ).toBe(413)
    })
})
