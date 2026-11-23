import { vi } from 'vitest'

export function stubReadyGameServer(): void {
    vi.stubGlobal('fetch', async (url: URL) => {
        if (url.pathname === '/ready') return Response.json({ state: 'ready' })
        if (url.pathname === '/admin/session') return new Response(null, { status: 403 })
        throw new Error(`Unexpected game server request to ${url.pathname}`)
    })
}
