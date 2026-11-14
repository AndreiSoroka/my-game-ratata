const preferenceKey = 'ratata:audio-muted'
const listeners = new Set<(muted: boolean) => void>()
let fallbackMuted = false

/** Test and explicitly silent sessions never inherit an audible saved preference. */
export function isAudioMuteForced(): boolean {
    const query = new URLSearchParams(window.location.search)
    return (
        import.meta.env.VITE_GAME_AUDIO_MUTED === '1' ||
        query.get('test') === '1' ||
        query.get('mute') === '1'
    )
}
export function isAudioMuted(): boolean {
    if (isAudioMuteForced()) return true
    try {
        const saved = window.localStorage.getItem(preferenceKey)
        return saved === null ? fallbackMuted : saved === 'true'
    } catch {
        return fallbackMuted
    }
}
export function setAudioMuted(muted: boolean): void {
    if (isAudioMuteForced()) return
    fallbackMuted = muted
    try {
        window.localStorage.setItem(preferenceKey, String(muted))
    } catch {
        // Keep the preference for this session when browser storage is unavailable.
    }
    for (const listener of listeners) listener(isAudioMuted())
}
export function subscribeAudioMute(listener: (muted: boolean) => void): () => void {
    listeners.add(listener)
    const storage = (event: StorageEvent) => {
        if (event.key === preferenceKey || event.key === null) listener(isAudioMuted())
    }
    window.addEventListener('storage', storage)
    return () => {
        listeners.delete(listener)
        window.removeEventListener('storage', storage)
    }
}
