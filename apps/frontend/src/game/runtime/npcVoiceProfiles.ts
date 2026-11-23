interface VoiceProfile {
    voiceURI: string
    rate: number
    pitch: number
}

const rates = [0.76, 1, 1.28]

function profileKey(actorId: string): string {
    return `ratata:npc-voice:${actorId}`
}

function inRange(value: unknown, minimum: number, maximum: number): value is number {
    return typeof value === 'number' && value >= minimum && value <= maximum
}

function loadProfile(actorId: string): VoiceProfile | undefined {
    try {
        const raw = window.localStorage.getItem(profileKey(actorId))
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

    public resolve(actorId: string, voices: readonly SpeechSynthesisVoice[]) {
        const available = voices
            .filter((voice) => voice.localService && /^ru(?:[-_]|$)/iu.test(voice.lang))
            .sort((left, right) => left.voiceURI.localeCompare(right.voiceURI))
        const fallback = available[0]
        if (fallback === undefined) return

        const cached = this.profiles.get(actorId)
        const saved = cached ?? loadProfile(actorId)
        const profile = saved ?? newProfile(available)
        if (profile === undefined) return
        if (cached === undefined) this.profiles.set(actorId, profile)
        if (saved === undefined) {
            try {
                window.localStorage.setItem(profileKey(actorId), JSON.stringify(profile))
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
