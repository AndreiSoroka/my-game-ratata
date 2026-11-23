interface VoiceProfile {
    voiceURI: string
    rate: number
    pitch: number
}

const rates = [0.76, 1, 1.28]

function profileKey(actorId: string, language: GameLocale): string {
    return language === 'ru' ? `ratata:npc-voice:${actorId}` : `ratata:npc-voice:en:${actorId}`
}

function inRange(value: unknown, minimum: number, maximum: number): value is number {
    return typeof value === 'number' && value >= minimum && value <= maximum
}

function loadProfile(key: string): VoiceProfile | undefined {
    try {
        const raw = window.localStorage.getItem(key)
        if (raw === null) return
        const stored = JSON.parse(raw) as Partial<VoiceProfile> | null
        if (
            typeof stored?.voiceURI === 'string' &&
            inRange(stored.rate, 0.1, 10) &&
            inRange(stored.pitch, 0, 2)
        ) {
            return { voiceURI: stored.voiceURI, rate: stored.rate, pitch: stored.pitch }
        }
    } catch {
        // A disabled or cleared browser store can still use a profile for this session.
    }
}

function newProfile(voices: readonly SpeechSynthesisVoice[]): VoiceProfile | undefined {
    const voice = voices[Math.floor(Math.random() * voices.length)]
    if (voice === undefined) return
    return {
        voiceURI: voice.voiceURI,
        rate: rates[Math.floor(Math.random() * rates.length)] ?? 1,
        pitch: (80 + Math.round(Math.random() * 40)) / 100,
    }
}

export class NpcVoiceProfiles {
    private readonly profiles = new Map<string, VoiceProfile>()

    public resolve(actorId: string, language: GameLocale, voices: readonly SpeechSynthesisVoice[]) {
        const available = voices
            .filter(
                (voice) =>
                    voice.localService && voice.lang.split(/[-_]/u)[0]?.toLowerCase() === language
            )
            .sort((left, right) => left.voiceURI.localeCompare(right.voiceURI))
        const fallback = available[0]
        if (fallback === undefined) return

        const key = profileKey(actorId, language)
        const cached = this.profiles.get(key)
        const saved = cached ?? loadProfile(key)
        const profile = saved ?? newProfile(available)
        if (profile === undefined) return
        if (cached === undefined) this.profiles.set(key, profile)
        if (saved === undefined) {
            try {
                window.localStorage.setItem(key, JSON.stringify(profile))
            } catch {
                // Use the in-memory profile if the browser store is unavailable.
            }
        }
        return {
            voice: available.find((voice) => voice.voiceURI === profile.voiceURI) ?? fallback,
            rate: profile.rate,
            pitch: profile.pitch,
        }
    }
}
import type { GameLocale } from '@my-game-ratata/contracts'
