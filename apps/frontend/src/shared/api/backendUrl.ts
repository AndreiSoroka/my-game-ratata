export function resolveBackendWebSocketUrl(): string {
    const configured = import.meta.env.VITE_BACKEND_WS_URL
    if (configured) return configured

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.hostname}:3000/ws`
}

export function resolveBackendHttpUrl(path: string): URL {
    const backend = new URL(resolveBackendWebSocketUrl(), window.location.href)
    backend.protocol = backend.protocol === 'wss:' ? 'https:' : 'http:'
    return new URL(path, backend.origin)
}
