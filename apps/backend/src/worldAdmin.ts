import { randomBytes, timingSafeEqual } from 'node:crypto'

import {
    isWorldEmptyMode,
    type WorldEmptyMode,
} from '@my-game-ratata/contracts'

import { readAdminPayload } from './worldAdminPayload'

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const codeLifetime = 120_000
const sessionLifetime = 1_800_000
const peerWindow = 120_000
const globalWindow = 600_000

type AdminIngress = 'local' | 'public'

interface AdminConnection {
    ingress: AdminIngress
    peer: string | undefined
    tls: boolean
}

interface WorldAdminOptions {
    localOrigins: readonly string[]
    localHost: string
    publicOrigin?: string
    proxyPeer?: string
    readMode(): WorldEmptyMode
    writeMode(mode: WorldEmptyMode): void
    now?: () => number
}

interface AccessCode {
    value: string
    expiresAt: number
    failures: number
}

interface AdminSession {
    expiresAt: number
    ingress: AdminIngress
    origin: string
}

export class WorldAdmin {
    private code: AccessCode | undefined
    private readonly attempts: Array<{ peer: string; at: number }> = []
    private readonly sessions = new Map<string, AdminSession>()
    private readonly now: () => number

    public constructor(private readonly options: WorldAdminOptions) {
        this.now = options.now ?? Date.now
    }

    public issueCode(): string {
        const value = Array.from(
            randomBytes(4),
            (byte) => alphabet[byte & 31]
        ).join('')
        this.code = { value, expiresAt: this.now() + codeLifetime, failures: 0 }
        return value
    }

    public async handle(
        request: Request,
        connection: AdminConnection
    ): Promise<Response> {
        const origin = this.authorizedOrigin(request, connection)
        if (origin === undefined) {
            return response({ error: 'Admin unavailable' }, 403)
        }
        const headers = {
            'Access-Control-Allow-Origin': origin,
            Vary: 'Origin',
        }
        const path = new URL(request.url).pathname
        const sessionPath =
            connection.ingress === 'local' ? '/admin/session' : '/admin/code'
        if (path !== sessionPath && path !== '/admin/world-mode') {
            return response({ error: 'Not found' }, 404, headers)
        }
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    ...headers,
                    'Access-Control-Allow-Methods':
                        path === sessionPath ? 'POST' : 'GET, PUT',
                    'Access-Control-Allow-Headers':
                        'Authorization, Content-Type',
                    'Cache-Control': 'no-store',
                },
            })
        }
        if (path === sessionPath && request.method === 'POST') {
            return this.openSession(request, connection, origin, headers)
        }
        if (path !== '/admin/world-mode') {
            return response({ error: 'Method not allowed' }, 405, headers)
        }
        return this.handleMode(request, connection.ingress, origin, headers)
    }

    private async handleMode(
        request: Request,
        ingress: AdminIngress,
        origin: string,
        headers: Record<string, string>
    ): Promise<Response> {
        if (!['GET', 'PUT'].includes(request.method)) {
            return response({ error: 'Method not allowed' }, 405, headers)
        }
        const token = request.headers
            .get('Authorization')
            ?.match(/^Bearer ([\w-]{32})$/u)?.[1]
        if (!this.authorizedSession(token, ingress, origin)) {
            return response(
                { error: 'Admin session unavailable' },
                401,
                headers
            )
        }
        if (request.method === 'PUT') {
            const payload = await readAdminPayload(request)
            if (!isWorldEmptyMode(payload?.['mode'])) {
                return response({ error: 'Invalid world mode' }, 400, headers)
            }
            if (!this.authorizedSession(token, ingress, origin)) {
                return response(
                    { error: 'Admin session unavailable' },
                    401,
                    headers
                )
            }
            this.options.writeMode(payload['mode'])
        }
        return response({ mode: this.options.readMode() }, 200, headers)
    }

    private authorizedOrigin(
        request: Request,
        connection: AdminConnection
    ): string | undefined {
        const origin = request.headers.get('Origin')
        const peer = ipv4Address(connection.peer)
        if (connection.ingress === 'local') {
            return origin !== null &&
                this.options.localOrigins.includes(origin) &&
                peer === '127.0.0.1' &&
                request.headers.get('Host') === this.options.localHost &&
                new URL(request.url).host === this.options.localHost
                ? origin
                : undefined
        }
        return origin !== null &&
            origin === this.options.publicOrigin &&
            (connection.tls || this.secureProxy(request, peer))
            ? origin
            : undefined
    }

    private secureProxy(request: Request, peer: string | undefined): boolean {
        return (
            peer !== undefined &&
            peer === this.options.proxyPeer &&
            request.headers.get('X-Forwarded-Proto') === 'https'
        )
    }

    private async openSession(
        request: Request,
        connection: AdminConnection,
        origin: string,
        headers: Record<string, string>
    ): Promise<Response> {
        if (connection.ingress === 'public') {
            const payload = await readAdminPayload(request)
            if (
                !this.redeemCode(
                    payload?.['code'],
                    ipv4Address(connection.peer) ?? 'unknown'
                )
            ) {
                return response(
                    { error: 'Admin code unavailable' },
                    401,
                    headers
                )
            }
        }
        const now = this.now()
        for (const [token, session] of this.sessions) {
            if (session.expiresAt <= now) {
                this.sessions.delete(token)
            }
        }
        if (this.sessions.size >= 128) {
            const first = this.sessions.keys().next().value
            if (first !== undefined) {
                this.sessions.delete(first)
            }
        }
        const token = randomBytes(24).toString('base64url')
        this.sessions.set(token, {
            expiresAt: now + sessionLifetime,
            ingress: connection.ingress,
            origin,
        })
        return response({ token }, 200, headers)
    }

    private authorizedSession(
        token: string | undefined,
        ingress: AdminIngress,
        origin: string
    ): boolean {
        const session =
            token === undefined ? undefined : this.sessions.get(token)
        return (
            session?.ingress === ingress &&
            session.origin === origin &&
            session.expiresAt > this.now()
        )
    }

    private redeemCode(value: unknown, peer: string): boolean {
        const now = this.now()
        while (
            this.attempts[0] !== undefined &&
            this.attempts[0].at <= now - globalWindow
        ) {
            this.attempts.shift()
        }
        if (
            this.attempts.length >= 20 ||
            this.attempts.filter(
                (entry) => entry.peer === peer && entry.at > now - peerWindow
            ).length >= 5
        ) {
            return false
        }
        const code = this.code
        if (code === undefined || code.expiresAt <= now) {
            return false
        }

        const candidate =
            typeof value === 'string' ? value.trim().toUpperCase() : ''
        if (
            /^[0-9A-HJKMNP-TV-Z]{4}$/u.test(candidate) &&
            timingSafeEqual(Buffer.from(candidate), Buffer.from(code.value))
        ) {
            this.code = undefined
            return true
        }
        this.attempts.push({ peer, at: now })
        code.failures += 1
        if (code.failures === 5) {
            this.code = undefined
        }
        return false
    }
}

export function ipv4Address(peer: string | undefined): string | undefined {
    return peer?.replace(/^::ffff:(?=\d+\.)/iu, '')
}

function response(
    body: object,
    status: number,
    headers: Record<string, string> = {}
): Response {
    const resultHeaders = new Headers(headers)
    resultHeaders.set('Cache-Control', 'no-store')
    return Response.json(body, { status, headers: resultHeaders })
}
