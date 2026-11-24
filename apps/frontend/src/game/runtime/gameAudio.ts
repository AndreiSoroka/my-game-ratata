import {
    type FootstepSourceSnapshot,
    type GameEventPayload,
    isArrowAbility,
    type Vector2,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import type { Sound } from 'excalibur'

import type { GameSoundId } from '../assets/soundCatalog'
import { isAudioMuted, subscribeAudioMute } from './audioPreference'
import { FootstepAudio } from './footstepAudio'
import { FootstepPlanner } from './footsteps'
import type { MapBuilding } from './mapBuildings'
import { type FootstepMap, surfaceAt } from './mapSurfaces'
import { NpcVoice, type NpcVoiceContext } from './npcVoice'
import { isNpcVoiceEnabled, subscribeNpcVoiceEnabled } from './npcVoicePreference'
import type { WorldAmbience } from './worldAmbience'

const eventSounds = new Map<GameEventPayload['kind'], GameSoundId>([
    ['attack', 'attack'],
    ['barrel_search', 'chestOpen'],
    ['chest_open', 'chestOpen'],
    ['damage', 'hit'],
    ['item_drop', 'drop'],
    ['water_drink', 'drink'],
    ['item_eat', 'drink'],
    ['item_equip', 'equip'],
    ['item_pickup', 'pickup'],
    ['item_stash', 'stash'],
])

function playsAttackSound(event: GameEventPayload): boolean {
    return (
        !isArrowAbility(event.abilityId) || event.phase === undefined || event.phase === 'completed'
    )
}

export class GameAudio {
    private readonly footsteps = new FootstepPlanner()
    private readonly footstepAudio: FootstepAudio
    private surfaceMap: FootstepMap | undefined
    private worldSuspended = false
    private readonly music: Sound
    private readonly sounds: Map<GameSoundId, Sound>
    private readonly unsubscribeAudio: () => void
    private readonly unsubscribeNpcVoice: () => void
    private voiceWorld: Pick<NpcVoiceContext, 'snapshot' | 'playerId'> = {
        snapshot: undefined,
        playerId: undefined,
    }
    private readonly npcVoice = new NpcVoice(() => ({
        ...this.voiceWorld,
        mapId: this.voiceWorld.snapshot?.location?.id,
        enabled:
            !document.hidden &&
            navigator.userActivation?.hasBeenActive !== false &&
            !isAudioMuted() &&
            isNpcVoiceEnabled(),
    }))
    private musicRequested = false
    private stopped = false

    public constructor(
        sounds: Map<GameSoundId, Sound>,
        music: Sound,
        private readonly ambience?: WorldAmbience
    ) {
        this.sounds = sounds
        this.music = music
        this.footstepAudio = new FootstepAudio(sounds)
        let wasMuted = isAudioMuted()
        this.unsubscribeAudio = subscribeAudioMute((muted) => {
            if (muted && !wasMuted) this.stopVoices()
            wasMuted = muted
            if (!muted) void this.syncMusic()
        })
        this.unsubscribeNpcVoice = subscribeNpcVoiceEnabled((enabled) => {
            if (!enabled) this.npcVoice.clear()
        })
        document.addEventListener('visibilitychange', this.onVisibilityChange)
    }

    public playMusic(): void {
        if (this.stopped) return
        this.musicRequested = true
        void this.syncMusic()
    }

    public startWorldAmbience(): void {
        if (!this.stopped) this.ambience?.start()
    }

    private async syncMusic(): Promise<void> {
        if (!this.musicRequested || document.hidden || isAudioMuted() || this.music.isPlaying)
            return
        try {
            if (this.music.isPaused) await this.music.resume()
            else await this.music.play()
        } catch {
            // Playback can be retried the next time the user enables audio or returns to the tab.
        }
    }

    public stop(): void {
        if (this.stopped) return
        this.stopped = true
        this.musicRequested = false
        this.unsubscribeAudio()
        this.unsubscribeNpcVoice()
        this.stopVoices()
        this.ambience?.dispose()
        this.npcVoice.dispose()
        this.voiceWorld = { snapshot: undefined, playerId: undefined }
        this.surfaceMap = undefined
        document.removeEventListener('visibilitychange', this.onVisibilityChange)
    }

    private stopVoices(): void {
        this.stopFootsteps()
        this.ambience?.clear()
        this.music.stop()
        for (const sound of this.sounds.values()) sound.stop()
        this.npcVoice.clear()
    }

    public setMap(
        { footsteps, buildings }: { footsteps: FootstepMap; buildings?: MapBuilding[] },
        locationId?: string
    ): void {
        if (this.stopped) return
        this.invalidateWorld()
        this.surfaceMap = footsteps
        if (locationId !== undefined) {
            this.ambience?.setMap(locationId, {
                buildings: buildings ?? [],
                tileWidth: footsteps.tileWidth,
                tileHeight: footsteps.tileHeight,
            })
        }
        this.resumeWorld()
    }

    public suspendWorld(): void {
        this.worldSuspended = true
        this.invalidateWorld()
    }

    public resumeWorld(): void {
        this.worldSuspended = false
    }

    public invalidateWorld(): void {
        this.stopFootsteps()
        this.ambience?.clear()
        this.npcVoice.clear()
        this.voiceWorld = { snapshot: undefined, playerId: undefined }
    }

    private readonly onVisibilityChange = (): void => {
        if (document.hidden) {
            this.stopFootsteps()
            this.ambience?.clear()
            this.npcVoice.clear()
            if (this.music.isPlaying) this.music.pause()
        } else {
            void this.syncMusic()
        }
    }

    private stopFootsteps(): void {
        this.footsteps.reset()
        this.footstepAudio.stop()
    }

    public playSound(id: GameSoundId): void {
        if (this.stopped || isAudioMuted()) return
        const sound = this.sounds.get(id)

        if (sound === undefined) {
            return
        }

        try {
            void sound.play().catch(() => undefined)
        } catch {
            // An unavailable audio device should not interrupt gameplay feedback.
        }
    }

    public playEventSound(event: GameEventPayload): void {
        if (this.stopped) return
        if (event.kind === 'chat') {
            this.npcVoice.receive(event)
            return
        }
        if (event.kind === 'attack' && !playsAttackSound(event)) return
        const sound = eventSounds.get(event.kind)
        if (sound) this.playSound(sound)
    }

    public observeWorld(
        snapshot: WorldSnapshot,
        localPlayerId: string | undefined,
        isPositionVisible?: (position: Vector2) => boolean
    ): void {
        if (this.stopped || this.worldSuspended) return
        this.voiceWorld = { snapshot, playerId: localPlayerId }
        this.npcVoice.refresh()
        const map = this.surfaceMap
        if (map === undefined || document.hidden || isAudioMuted()) return
        const listener = snapshot.characters.find((actor) => actor.id === localPlayerId)
        if (!listener?.alive) {
            this.stopFootsteps()
            this.ambience?.clear()
            return
        }
        if (isPositionVisible) this.ambience?.observeWorld(snapshot, listener.id, isPositionVisible)
        this.observeFootsteps(snapshot, listener.id, map)
    }

    private observeFootsteps(
        snapshot: WorldSnapshot,
        localPlayerId: string,
        map: FootstepMap
    ): void {
        const sources = new Map<string, FootstepSourceSnapshot>(
            snapshot.footstepSources?.map((source) => [source.id, source])
        )
        for (const character of snapshot.characters) sources.set(character.id, character)
        const steps = this.footsteps.collect(
            [...sources.values()],
            localPlayerId,
            performance.now(),
            (point) => surfaceAt(map, point)
        )
        for (const step of steps) this.footstepAudio.play(step)
    }
}
