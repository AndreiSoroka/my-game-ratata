import {
    type GameEventPayload,
    isArrowAbility,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import type { Sound } from 'excalibur'

import type { GameSoundId } from '../assets/soundCatalog'
import { isAudioMuted, subscribeAudioMute } from './audioPreference'
import { FootstepAudio } from './footstepAudio'
import { FootstepPlanner } from './footsteps'
import { type FootstepMap, surfaceAt } from './mapSurfaces'

function playsAttackSound(event: GameEventPayload): boolean {
    return (
        !isArrowAbility(event.abilityId) || event.phase === undefined || event.phase === 'completed'
    )
}

export class GameAudio {
    private readonly footsteps = new FootstepPlanner()
    private readonly footstepAudio: FootstepAudio
    private surfaceMap: FootstepMap | undefined
    private readonly music: Sound
    private readonly sounds: Map<GameSoundId, Sound>
    private readonly unsubscribeAudio: () => void
    private musicRequested = false

    public constructor(sounds: Map<GameSoundId, Sound>, music: Sound) {
        this.sounds = sounds
        this.music = music
        this.footstepAudio = new FootstepAudio(sounds)
        this.unsubscribeAudio = subscribeAudioMute((muted) => {
            if (muted) this.stopVoices()
            else if (this.musicRequested) this.playMusic()
        })
        document.addEventListener('visibilitychange', this.onVisibilityChange)
    }

    public playMusic(): void {
        this.musicRequested = true
        if (isAudioMuted()) return
        void Promise.resolve(this.music.play()).catch(() => undefined)
    }

    public stop(): void {
        this.musicRequested = false
        this.unsubscribeAudio()
        this.stopVoices()
        this.surfaceMap = undefined
        document.removeEventListener('visibilitychange', this.onVisibilityChange)
    }

    private stopVoices(): void {
        this.music.stop()
        for (const sound of this.sounds.values()) sound.stop()
        this.stopFootsteps()
    }

    public setMap(map: { footsteps: FootstepMap }): void {
        this.pauseMovement()
        this.surfaceMap = map.footsteps
    }

    public pauseMovement(): void {
        this.stopFootsteps()
        this.surfaceMap = undefined
    }

    private readonly onVisibilityChange = (): void => {
        if (document.hidden) {
            this.stopFootsteps()
        }
    }

    private stopFootsteps(): void {
        this.footsteps.reset()
        this.footstepAudio.stop()
    }

    public playSound(id: GameSoundId): void {
        if (isAudioMuted()) return
        const sound = this.sounds.get(id)

        if (sound === undefined) {
            return
        }

        void Promise.resolve(sound.play()).catch(() => undefined)
    }

    public playEventSound(event: GameEventPayload): void {
        switch (event.kind) {
            case 'attack':
                if (playsAttackSound(event)) this.playSound('attack')
                return
            case 'barrel_search':
            case 'chest_open':
                this.playSound('chestOpen')
                return
            case 'damage':
                this.playSound('hit')
                return
            case 'item_drop':
                this.playSound('drop')
                return
            case 'water_drink':
            case 'item_eat':
                this.playSound('drink')
                return
            case 'item_equip':
                this.playSound('equip')
                return
            case 'item_pickup':
                this.playSound('pickup')
                return
            case 'item_stash':
                this.playSound('stash')
                return
            default:
                return
        }
    }

    public playMovementSound(snapshot: WorldSnapshot, localPlayerId: string | undefined): void {
        const map = this.surfaceMap
        if (map === undefined || document.hidden || isAudioMuted()) return
        const listener = snapshot.characters.find((actor) => actor.id === localPlayerId)
        if (!listener?.alive) {
            this.stopFootsteps()
            return
        }
        const steps = this.footsteps.collect(
            snapshot.characters,
            localPlayerId,
            performance.now(),
            (point) => surfaceAt(map, point)
        )
        for (const step of steps) this.footstepAudio.play(step)
    }
}
