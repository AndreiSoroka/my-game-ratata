import { type WorldEmptyMode } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { WorldAdmin } from '../src/worldAdmin'

const localOrigin = 'http://127.0.0.1:5500'
const publicOrigin = 'https://ratata.example'
const localHost = '127.0.0.1:4500'
const localBackend = `http://${localHost}`
const publicBackend = 'https://api.ratata.example'
const local = { ingress: 'local', peer: '127.0.0.1', tls: false } as const
const remote = { ingress: 'public', peer: '192.0.2.4', tls: true } as const

function fixture() {
    let now = 10_000
    let mode: WorldEmptyMode = 'online_ai'
    const admin = new WorldAdmin({
        localHost,
        localOrigins: [localOrigin],
        publicOrigin,
        proxyPeer: '10.0.0.2',
        readMode: () => mode,
        writeMode: (next) => {
            mode = next
        },
        now: () => now,
    })
    return {
        admin,
        mode: () => mode,
        advance: (ms: number) => {
            now += ms
        },
    }
}

function localRequest(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers)
    if (!headers.has('Origin')) {
        headers.set('Origin', localOrigin)
    }
    if (!headers.has('Host')) {
        headers.set('Host', localHost)
    }
    return new Request(`${localBackend}${path}`, { ...init, headers })
}

function redeem(code: string, origin = publicOrigin) {
    return new Request(`${publicBackend}/admin/code`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
    })
}

async function authorization(response: Response): Promise<string> {
    expect(response.status).toBe(200)
    const body = (await response.json()) as { token: string }
    expect(body.token).toHaveLength(32)
    return `Bearer ${body.token}`
}

describe('world Admin access', () => {
    it('only grants automatic access on the dedicated loopback listener and exact frontend origin', async () => {
        const { admin } = fixture()
        const request = () => localRequest('/admin/session', { method: 'POST' })
        expect((await admin.handle(request(), remote)).status).toBe(403)
        expect(
            (await admin.handle(request(), { ...local, peer: '192.0.2.4' }))
                .status
        ).toBe(403)
        for (const headers of [
            { Origin: 'http://localhost.evil.example:5500' },
            { Host: 'example.org:4500' },
        ]) {
            const denied = await admin.handle(
                localRequest('/admin/session', { method: 'POST', headers }),
                local
            )
            expect(denied.status).toBe(403)
            expect(denied.headers.has('Access-Control-Allow-Origin')).toBe(
                false
            )
        }
        const missingOrigin = new Request(`${localBackend}/admin/session`, {
            method: 'POST',
        })
        expect((await admin.handle(missingOrigin, local)).status).toBe(403)
        const authenticated = await admin.handle(request(), local)
        expect(authenticated.headers.get('Access-Control-Allow-Origin')).toBe(
            localOrigin
        )
        await authorization(authenticated)
    })

    it('validates mode mutations and session ingress, and expires the session', async () => {
        const { admin, advance, mode } = fixture()
        const session = await authorization(
            await admin.handle(
                localRequest('/admin/session', { method: 'POST' }),
                local
            )
        )
        const settings = '/admin/world-mode'
        const update = (mode: string, token = session) =>
            localRequest(settings, {
                method: 'PUT',
                headers: {
                    Authorization: token,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ mode }),
            })
        const preflight = await admin.handle(
            localRequest(settings, { method: 'OPTIONS' }),
            local
        )
        expect(preflight.status).toBe(204)
        expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain(
            'Authorization'
        )
        expect(
            (
                await admin.handle(
                    update('paused_when_empty', 'Bearer expired'),
                    local
                )
            ).status
        ).toBe(401)
        expect((await admin.handle(update('invalid'), local)).status).toBe(400)
        expect(mode()).toBe('online_ai')
        const changed = await admin.handle(update('paused_when_empty'), local)
        expect(await changed.json()).toEqual({ mode: 'paused_when_empty' })
        const readFromPublic = new Request(`${publicBackend}${settings}`, {
            headers: { Origin: publicOrigin, Authorization: session },
        })
        expect((await admin.handle(readFromPublic, remote)).status).toBe(401)
        advance(30 * 60 * 1000)
        expect((await admin.handle(update('always'), local)).status).toBe(401)
        expect(mode()).toBe('paused_when_empty')
    })
})

describe('world Admin codes', () => {
    it('accepts remote codes only over TLS or the trusted private ingress and only once', async () => {
        const { admin } = fixture()
        const code = admin.issueCode()
        expect(code).toMatch(/^[0-9A-Z]{4}$/u)
        const forged = redeem(code)
        forged.headers.set('X-Forwarded-Proto', 'https')
        forged.headers.set('X-Forwarded-For', '10.0.0.2')
        expect(
            (await admin.handle(forged, { ...remote, tls: false })).status
        ).toBe(403)
        expect(
            (await admin.handle(redeem(code, 'https://other.example'), remote))
                .status
        ).toBe(403)
        const proxy = { ...remote, peer: '10.0.0.2', tls: false }
        expect((await admin.handle(redeem(code), proxy)).status).toBe(403)
        const forwarded = redeem(code.toLowerCase())
        forwarded.headers.set('X-Forwarded-Proto', 'https')
        await authorization(await admin.handle(forwarded, proxy))
        expect((await admin.handle(redeem(code), remote)).status).toBe(401)
    })

    it('burns a code after five distributed failures and expires a new code after two minutes', async () => {
        const { admin, advance } = fixture()
        const code = admin.issueCode()
        for (let i = 0; i < 5; i++) {
            expect(
                (
                    await admin.handle(redeem('####'), {
                        ...remote,
                        peer: `192.0.2.${String(i + 1)}`,
                    })
                ).status
            ).toBe(401)
        }
        expect((await admin.handle(redeem(code), remote)).status).toBe(401)
        const replacement = admin.issueCode()
        advance(120_000)
        expect((await admin.handle(redeem(replacement), remote)).status).toBe(
            401
        )
    })
})
