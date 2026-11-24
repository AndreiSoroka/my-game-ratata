import {
    type GameEventPayload,
    type Vector2,
    WORLD_SOUND_RADII,
    type WorldAudioCue,
} from '@my-game-ratata/contracts'
import type { Sound } from 'excalibur'

import type { GameSoundId } from '../assets/soundCatalog'
import { footstepGain } from './footsteps'
import { SoundVoices } from './soundVoices'

const personalSounds = new Map<GameEventPayload['kind'], GameSoundId>([
    ['item_eat', 'drink'],
    ['item_equip', 'equip'],
    ['item_pickup', 'pickup'],
    ['item_stash', 'stash'],
])

const receiptLimit = 128

export class WorldEventAudio {
    private readonly voices = new SoundVoices(12)
    private readonly receipts = new Set<string>()
    private epoch: string | undefined
    private playerId: string | undefined

    public constructor(private readonly sounds: ReadonlyMap<GameSoundId, Sound>) {}

    public observeSession(epoch: string | undefined, playerId: string | undefined): void {
        if (this.epoch === epoch && this.playerId === playerId) return
        this.stop()
        this.receipts.clear()
        this.epoch = epoch
        this.playerId = playerId
    }

    public receive(event: GameEventPayload, locationId: string, listener: Vector2): void {
        if (event.audioCue !== undefined) {
            this.playCue(event.audioCue, locationId, listener)
            return
        }
        if (event.kind === 'item_pickup' && event.chestId !== undefined) return
        const sound = personalSounds.get(event.kind)
        if (sound !== undefined && event.actorId === this.playerId) {
            this.voices.play(this.sounds.get(sound), { volume: 1 })
        }
    }

    private playCue(cue: WorldAudioCue, locationId: string, listener: Vector2): void {
        if (cue.locationId !== locationId || this.receipts.has(cue.id)) return
        const radius = WORLD_SOUND_RADII[cue.effect]
        const distance = Math.hypot(listener.x - cue.position.x, listener.y - cue.position.y)
        if (!Number.isFinite(distance) || !(radius > 0)) return
        this.receipts.add(cue.id)
        if (this.receipts.size > receiptLimit) {
            this.receipts.delete(this.receipts.values().next().value!)
        }
        const volume = footstepGain(distance, radius) * (cue.obstructed ? 0.5 : 1)
        if (volume > 0) this.voices.play(this.sounds.get(cue.effect), { volume })
    }

    public stop(): void {
        this.voices.stop()
    }
}
