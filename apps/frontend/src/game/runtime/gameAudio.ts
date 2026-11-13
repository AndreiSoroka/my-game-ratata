import type { GameEventPayload, WorldSnapshot } from '@my-game-ratata/contracts'
import type { Sound } from 'excalibur'

import type { GameSoundId } from '../assets/soundCatalog'
import { FootstepAudio } from './footstepAudio'
import { FootstepPlanner } from './footsteps'
import { type FootstepMap, surfaceAt } from './mapSurfaces'

export class GameAudio {
    private readonly footsteps = new FootstepPlanner()
    private readonly footstepAudio: FootstepAudio
    private surfaceMap: FootstepMap | undefined
    private readonly music: Sound
    private readonly sounds: Map<GameSoundId, Sound>

    public constructor(sounds: Map<GameSoundId, Sound>, music: Sound) {
        this.sounds = sounds
        this.music = music
        this.footstepAudio = new FootstepAudio(sounds)
        document.addEventListener('visibilitychange', this.onVisibilityChange)
    }

    public playMusic(): void {
        void Promise.resolve(this.music.play()).catch(() => undefined)
    }

    public stop(): void {
        this.music.stop()
        this.pauseMovement()
        document.removeEventListener('visibilitychange', this.onVisibilityChange)
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
        const sound = this.sounds.get(id)

        if (sound === undefined) {
            return
        }

        void Promise.resolve(sound.play()).catch(() => undefined)
    }

    public playEventSound(event: GameEventPayload): void {
        switch (event.kind) {
            case 'attack':
                this.playSound('attack')
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
        if (map === undefined || document.hidden) return
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
