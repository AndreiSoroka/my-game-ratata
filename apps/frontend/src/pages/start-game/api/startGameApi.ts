import {
    type GameReadiness,
    isWorldEmptyMode,
    type WorldEmptyMode,
} from '@my-game-ratata/contracts'

import { resolveBackendHttpUrl } from '@/shared/api'

const requestTimeoutMs = 5_000
const loopbackHosts = ['localhost', '127.0.0.1', '[::1]']

export async function getGameReadiness(signal: AbortSignal): Promise<GameReadiness['state']> {
    const response = await request(resolveBackendHttpUrl('/ready'), signal)
    if (!response.ok && response.status !== 503) throw new Error('Invalid readiness response')
    const { state } = await readJson(response)
    if (state === 'ready' || state === 'checking' || state === 'ai_unavailable') return state
    throw new Error('Invalid readiness state')
}

export interface WorldAdminSession {
    origin: URL
    token: string
}

export function localAdminOrigin(): URL | undefined {
    if (!loopbackHosts.includes(window.location.hostname)) return undefined
    const configured = import.meta.env.VITE_LOCAL_ADMIN_URL || 'http://127.0.0.1:3001'
    if (!URL.canParse(configured)) return undefined
    const origin = new URL(configured)
    if (origin.hostname !== '127.0.0.1' || origin.protocol !== 'http:') return undefined
    return origin
}

export function canUseRemoteAdmin(): boolean {
    return window.location.protocol === 'https:' && resolveBackendHttpUrl('/').protocol === 'https:'
}

export function authorizeLocalAdmin(origin: URL, signal: AbortSignal): Promise<WorldAdminSession> {
    return authorize(origin, '/admin/session', signal, { method: 'POST' })
}

export function authorizeAdminCode(code: string, signal: AbortSignal): Promise<WorldAdminSession> {
    if (!canUseRemoteAdmin()) return Promise.reject(new Error('Secure origin required'))
    return authorize(resolveBackendHttpUrl('/'), '/admin/code', signal, {
        method: 'POST',
        ...jsonBody({ code }),
    })
}

export async function getWorldEmptyMode(
    session: WorldAdminSession,
    signal: AbortSignal
): Promise<WorldEmptyMode> {
    return readWorldEmptyMode(await adminRequest(session, signal))
}

export async function saveWorldEmptyMode(
    session: WorldAdminSession,
    signal: AbortSignal,
    mode: WorldEmptyMode
): Promise<WorldEmptyMode> {
    return readWorldEmptyMode(
        await adminRequest(session, signal, { method: 'PUT', ...jsonBody({ mode }) })
    )
}

export class AdminSessionExpired extends Error {}

async function authorize(
    origin: URL,
    path: string,
    signal: AbortSignal,
    options: RequestInit
): Promise<WorldAdminSession> {
    const response = await request(new URL(path, origin), signal, options)
    if (!response.ok) throw new Error('Administration authorization failed')
    const { token } = await readJson(response)
    if (typeof token !== 'string' || token.length === 0) throw new Error('Invalid session')
    return { origin, token }
}

async function adminRequest(
    session: WorldAdminSession,
    signal: AbortSignal,
    options: RequestInit = {}
): Promise<Response> {
    const headers = new Headers(options.headers)
    headers.set('authorization', `Bearer ${session.token}`)
    const response = await request(new URL('/admin/world-mode', session.origin), signal, {
        ...options,
        headers,
    })
    if (response.status === 401 || response.status === 403) throw new AdminSessionExpired()
    if (!response.ok) throw new Error('World mode request failed')
    return response
}

async function readWorldEmptyMode(response: Response): Promise<WorldEmptyMode> {
    const value = (await readJson(response))['mode']
    if (!isWorldEmptyMode(value)) throw new Error('Invalid world mode')
    return value
}

function request(url: URL, signal: AbortSignal, options: RequestInit = {}): Promise<Response> {
    return fetch(url, {
        ...options,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]),
    })
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
    const value: unknown = await response.json()
    if (typeof value !== 'object' || !value || Array.isArray(value))
        throw new Error('Invalid response')
    return value as Record<string, unknown>
}

function jsonBody(value: object): Pick<RequestInit, 'body' | 'headers'> {
    return { body: JSON.stringify(value), headers: { 'content-type': 'application/json' } }
}
