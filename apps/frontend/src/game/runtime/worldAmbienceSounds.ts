import { type PlayOptions, Sound, type SoundTrack } from 'excalibur'

import { musicCatalog } from '../assets/soundCatalog'

const root = '/game/assets/audio/ambience'
const assets = {
    portal: { src: `${root}/portal-hum.wav`, volume: 0.1 },
    bird1: { src: `${root}/forest-bird-1.mp3`, volume: 0.15 },
    bird2: { src: `${root}/forest-bird-2.mp3`, volume: 0.15 },
    wind: { src: `${root}/forest-wind.mp3`, volume: 0.22 },
    water: { src: `${root}/water-shore.wav`, volume: 0.14 },
    magicCast: { src: `${root}/magic-cast.mp3`, volume: 0.24 },
    prayerWhisper: { src: `${root}/prayer-whisper.mp3`, volume: 0.16 },
    humanDeath: { src: `${root}/human-death.mp3`, volume: 0.22 },
    forestBattle: musicCatalog.forestBattle,
} as const

export type AmbienceSoundId = keyof typeof assets
export type LoadAmbienceSound = (src: string, signal: AbortSignal) => Promise<Sound>

async function loadAmbienceSound(src: string, signal: AbortSignal): Promise<Sound> {
    const response = await fetch(src, { signal })
    if (!response.ok) throw new Error(`Audio request failed: ${response.status}`)
    const blob = await response.blob()
    if (signal.aborted) throw signal.reason
    return Sound.fromBlob(blob)
}

/** Optional local clips are fetched and decoded once per live engine. */
export class WorldAmbienceSounds {
    private readonly requested = new Set<AmbienceSoundId>()
    private readonly pending = new Map<AbortController, number>()
    private readonly ready = new Map<AmbienceSoundId, Sound>()
    private readonly outputs = new Set<GainNode>()
    private disposed = false

    public constructor(private readonly loadSound: LoadAmbienceSound = loadAmbienceSound) {}

    public request(id: AmbienceSoundId): void {
        if (this.disposed || this.requested.has(id)) return
        this.requested.add(id)
        void this.load(id)
    }

    public isReady(id: AmbienceSoundId): boolean {
        return this.ready.has(id)
    }

    public play(id: AmbienceSoundId, options?: PlayOptions): SoundTrack | undefined {
        const sound = this.ready.get(id)
        if (!sound) return undefined
        try {
            this.outputs.add(sound.output)
            return sound.start(options) ?? undefined
        } catch {
            // A device or audio graph failure must not interrupt the scene.
            return undefined
        }
    }

    public dispose(): void {
        this.disposed = true
        for (const [controller, timeout] of this.pending) {
            window.clearTimeout(timeout)
            controller.abort()
        }
        this.pending.clear()
        this.ready.clear()
        for (const output of this.outputs) output.disconnect()
        this.outputs.clear()
    }

    private async load(id: AmbienceSoundId): Promise<void> {
        const definition = assets[id]
        const controller = new AbortController()
        const timeout = window.setTimeout(() => {
            controller.abort()
            this.pending.delete(controller)
        }, 8000)
        this.pending.set(controller, timeout)
        try {
            const sound = await this.loadSound(definition.src, controller.signal)
            if (this.disposed || controller.signal.aborted) return
            sound.volume = definition.volume
            this.ready.set(id, sound)
        } catch {
            // A failed optional clip stays unavailable for this run.
        } finally {
            window.clearTimeout(timeout)
            this.pending.delete(controller)
        }
    }
}
