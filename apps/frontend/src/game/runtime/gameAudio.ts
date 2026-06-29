import type { GameEventPayload, WorldSnapshot } from '@my-game-ratata/contracts'
import type { Sound } from 'excalibur'

import type { GameSoundId } from '../assets/soundCatalog'

export class GameAudio {
    private lastMoveSoundAt = 0
    private readonly music: Sound
    private readonly sounds: Map<GameSoundId, Sound>

    public constructor(sounds: Map<GameSoundId, Sound>, music: Sound) {
        this.sounds = sounds
        this.music = music
    }

    public playMusic(): void {
        void Promise.resolve(this.music.play()).catch(() => undefined)
    }

    public stop(): void {
        this.music.stop()
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
            case 'chest_open':
                this.playSound('chestOpen')
                return
            case 'damage':
                this.playSound('hit')
                return
            case 'item_drop':
                this.playSound('drop')
                return
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
        const player = snapshot.characters.find((character) => character.id === localPlayerId)
        const now = performance.now()

        if (
            player === undefined ||
            !player.alive ||
            Math.hypot(player.velocity.x, player.velocity.y) < 1 ||
            now - this.lastMoveSoundAt < 460
        ) {
            return
        }

        this.lastMoveSoundAt = now
        this.playSound('move')
    }
}
