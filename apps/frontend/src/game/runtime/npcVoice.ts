import {
    type GameEventPayload,
    PUBLIC_SPEECH_RADIUS,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import { NpcVoiceProfiles } from './npcVoiceProfiles'

const fullVolumeDistance = 24
const edgeVolume = 0.03
const pendingLifetimeMs = 3_000
const maxPlaybackMs = 60_000

export interface NpcVoiceContext {
    enabled: boolean
    snapshot: WorldSnapshot | undefined
    playerId: string | undefined
    mapId: string | undefined
}

interface VoiceLine {
    actorId: string
    locationId: string
    speechId: number
    voice: 'ambient' | 'dialogue'
    text: string
}

type PendingLine = VoiceLine & { expiresAt: number }

interface ActiveLine {
    line: VoiceLine
    utterance: SpeechSynthesisUtterance
    timeout: number
}

function voiceLine(event: GameEventPayload): VoiceLine | undefined {
    const { actorId, locationId, speechId, voice, text } = event
    if (event.kind !== 'chat' || (voice !== 'ambient' && voice !== 'dialogue')) return
    if (!actorId || !locationId || speechId === undefined || !text?.trim()) return
    if (!Number.isSafeInteger(speechId)) return
    return { actorId, locationId, speechId, voice, text }
}

function volumeAt(distance: number): number {
    if (distance > PUBLIC_SPEECH_RADIUS) return 0
    const relativeDistance = Math.max(0, distance - fullVolumeDistance)
    const remaining = 1 - relativeDistance / (PUBLIC_SPEECH_RADIUS - fullVolumeDistance)
    return edgeVolume + (1 - edgeVolume) * remaining ** 2
}

function lineVolume(context: NpcVoiceContext, line: VoiceLine): number {
    const characters = context.snapshot?.characters
    const speaker = characters?.find((character) => character.id === line.actorId)
    const listener = characters?.find((character) => character.id === context.playerId)
    if (!speaker?.alive || !listener?.alive) return 0
    return volumeAt(
        Math.hypot(
            speaker.position.x - listener.position.x,
            speaker.position.y - listener.position.y
        )
    )
}

export class NpcVoice {
    private readonly synthesis: SpeechSynthesis | undefined =
        typeof window === 'undefined' ? undefined : window.speechSynthesis
    private readonly profiles = new NpcVoiceProfiles()
    private readonly receipts = new Map<string, number>()
    private voices: SpeechSynthesisVoice[] = []
    private session: string | undefined
    private mapId: string | undefined
    private pending: PendingLine | undefined
    private active: ActiveLine | undefined
    private disposed = false

    public constructor(private readonly context: () => NpcVoiceContext) {
        this.voices = this.synthesis?.getVoices() ?? []
        this.synthesis?.addEventListener('voiceschanged', this.onVoicesChanged)
    }

    public receive(event: GameEventPayload): void {
        const line = voiceLine(event)
        if (line === undefined || this.disposed || !this.synthesis) return
        const context = this.currentContext()
        if (context === undefined || line.locationId !== context.mapId) return

        const lastReceipt = this.receipts.get(line.actorId) ?? 0
        if (line.speechId <= lastReceipt) return
        this.receipts.set(line.actorId, line.speechId)
        if (!context.enabled) return

        this.enqueue(line)
        if (this.voices.length === 0) this.voices = this.synthesis.getVoices()
        this.playPending(context)
    }

    private enqueue(line: VoiceLine): void {
        const now = performance.now()
        if (
            this.pending?.voice === 'dialogue' &&
            this.pending.expiresAt > now &&
            line.voice === 'ambient'
        ) {
            return
        }
        this.pending = { ...line, expiresAt: now + pendingLifetimeMs }
    }

    public readonly refresh = (): void => {
        if (!this.synthesis || this.disposed) return
        const context = this.currentContext()
        if (context?.enabled) this.playPending(context)
    }

    public clear(): void {
        this.pending = undefined
        this.cancelActive()
    }

    public dispose(): void {
        this.disposed = true
        this.synthesis?.removeEventListener('voiceschanged', this.onVoicesChanged)
        this.clear()
    }

    private readonly onVoicesChanged = (): void => {
        this.voices = this.synthesis?.getVoices() ?? []
        this.refresh()
    }

    private currentContext(): NpcVoiceContext | undefined {
        const context = this.context()
        const { snapshot, playerId, mapId, enabled } = context
        if (snapshot !== undefined && playerId !== undefined) {
            const session = JSON.stringify([snapshot.serverEpoch, playerId])
            if (session !== this.session) {
                this.clear()
                this.receipts.clear()
                this.session = session
            }
        }
        if (mapId !== this.mapId) {
            this.clear()
            this.mapId = mapId
        }
        if (mapId === undefined || snapshot?.location?.id !== mapId) {
            this.clear()
            return
        }
        if (
            !snapshot.characters.some((character) => character.id === playerId && character.alive)
        ) {
            this.clear()
            return
        }
        if (!enabled) this.clear()
        return context
    }

    private playPending(context: NpcVoiceContext): void {
        const pending = this.pending
        if (pending === undefined || !this.synthesis) return
        if (pending.expiresAt <= performance.now()) {
            this.pending = undefined
            return
        }
        const playing = this.active?.line
        if (
            playing !== undefined &&
            (playing.voice === 'dialogue' || pending.voice === 'ambient')
        ) {
            return
        }

        const volume = lineVolume(context, pending)
        if (volume === 0 || typeof window.SpeechSynthesisUtterance !== 'function') {
            this.pending = undefined
            return
        }
        const speech = this.profiles.resolve(pending.actorId, this.voices)
        if (speech === undefined) return

        this.pending = undefined
        this.cancelActive()
        // Keep dialogue plain text on engines that support SSML input.
        const utterance = new window.SpeechSynthesisUtterance(
            pending.text.replaceAll('<', '‹').replaceAll('>', '›')
        )
        utterance.voice = speech.voice
        utterance.lang = 'ru-RU'
        utterance.rate = speech.rate
        utterance.pitch = speech.pitch
        utterance.volume = volume
        this.play(pending, utterance)
    }

    private play(line: VoiceLine, utterance: SpeechSynthesisUtterance): void {
        const finish = () => {
            if (this.active?.utterance !== utterance) return
            window.clearTimeout(this.active.timeout)
            this.active = undefined
            this.refresh()
        }
        utterance.onend = finish
        utterance.onerror = finish
        const timeout = window.setTimeout(() => {
            if (this.active?.utterance !== utterance) return
            this.cancelActive()
            this.refresh()
        }, maxPlaybackMs)
        this.active = { line, utterance, timeout }
        try {
            this.synthesis?.speak(utterance)
        } catch {
            finish()
        }
    }

    private cancelActive(): void {
        const active = this.active
        if (active === undefined) return
        this.active = undefined
        window.clearTimeout(active.timeout)
        this.synthesis?.cancel()
    }
}
