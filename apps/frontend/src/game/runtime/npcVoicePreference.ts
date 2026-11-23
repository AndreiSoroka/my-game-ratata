const preferenceKey = 'ratata:npc-voice-enabled'
const listeners = new Set<(enabled: boolean) => void>()
let sessionEnabled: boolean | undefined

export function isNpcVoiceEnabled(): boolean {
    if (sessionEnabled !== undefined) return sessionEnabled
    try {
        return window.localStorage.getItem(preferenceKey) !== 'false'
    } catch {
        return true
    }
}

export function setNpcVoiceEnabled(enabled: boolean): void {
    try {
        window.localStorage.setItem(preferenceKey, String(enabled))
        sessionEnabled = undefined
    } catch {
        sessionEnabled = enabled
    }
    for (const listener of listeners) listener(enabled)
}

export function subscribeNpcVoiceEnabled(listener: (enabled: boolean) => void): () => void {
    listeners.add(listener)
    const storage = (event: StorageEvent): void => {
        if (event.key === preferenceKey || event.key === null) listener(isNpcVoiceEnabled())
    }
    window.addEventListener('storage', storage)
    return () => {
        listeners.delete(listener)
        window.removeEventListener('storage', storage)
    }
}
