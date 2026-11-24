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
import { BattleMusicState } from './battleMusicState'
import { type CastAudio, isMagicCastAttack } from './castAudio'
import { FootstepAudio } from './footstepAudio'
import { FootstepPlanner } from './footsteps'
import { GameMusic } from './gameMusic'
import type { HumanDeathAudio } from './humanDeathAudio'
import type { AmbientTerrain } from './mapAmbientTerrain'
import type { MapBuilding } from './mapBuildings'
import { type FootstepMap, surfaceAt } from './mapSurfaces'
import { NpcVoice, type NpcVoiceContext } from './npcVoice'
import { isNpcVoiceEnabled, subscribeNpcVoiceEnabled } from './npcVoicePreference'
import type { WorldAmbience } from './worldAmbience'
import type { WorldAmbienceSounds } from './worldAmbienceSounds'

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

interface CharacterAudio {
    casts: CastAudio
    deaths: HumanDeathAudio
}

export class GameAudio {
    private readonly footsteps = new FootstepPlanner()
    private readonly footstepAudio: FootstepAudio
    private surfaceMap: FootstepMap | undefined
    private worldSuspended = false
    private readonly music: GameMusic
    private readonly battleMusic = new BattleMusicState()
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
    private worldAudioStarted = false
    private stopped = false

    public constructor(
        sounds: Map<GameSoundId, Sound>,
        music: Sound,
        private readonly ambience?: WorldAmbience,
        private readonly characterAudio?: CharacterAudio,
        battleBank?: Pick<WorldAmbienceSounds, 'request' | 'isReady' | 'play'>
    ) {
        this.sounds = sounds
        this.music = new GameMusic(music, battleBank)
        this.footstepAudio = new FootstepAudio(sounds)
        let wasMuted = isAudioMuted()
        this.unsubscribeAudio = subscribeAudioMute((muted) => {
            if (muted && !wasMuted) {
                this.music.stop()
                this.stopVoices()
            }
            wasMuted = muted
            if (!muted) this.resumeAudiblePlayback()
        })
        this.unsubscribeNpcVoice = subscribeNpcVoiceEnabled((enabled) => {
            if (!enabled) this.npcVoice.clear()
        })
        document.addEventListener('visibilitychange', this.onVisibilityChange)
    }

    public playMusic(): void {
        if (this.stopped) return
        this.music.start()
    }

    public updateMusic(): void {
        this.music.setBattle(this.battleMusic.active)
        this.music.update()
    }

    public startWorldAmbience(): void {
        if (this.stopped || this.worldAudioStarted) return
        this.worldAudioStarted = true
        this.ambience?.start()
        this.prepareCharacterAudio()
    }

    private prepareCharacterAudio(): void {
        if (!this.worldAudioStarted || !this.characterAudio || document.hidden || isAudioMuted())
            return
        this.characterAudio.casts.prepare()
        this.characterAudio.deaths.prepare()
    }

    private resumeAudiblePlayback(): void {
        this.prepareCharacterAudio()
        this.music.resume()
    }

    public stop(): void {
        if (this.stopped) return
        this.stopped = true
        this.unsubscribeAudio()
        this.unsubscribeNpcVoice()
        this.music.dispose()
        this.stopVoices()
        this.ambience?.dispose()
        this.characterAudio?.casts.reset()
        this.characterAudio?.deaths.reset()
        this.npcVoice.dispose()
        this.voiceWorld = { snapshot: undefined, playerId: undefined }
        this.surfaceMap = undefined
        document.removeEventListener('visibilitychange', this.onVisibilityChange)
    }

    private stopVoices(): void {
        this.clearWorldSounds()
        for (const sound of this.sounds.values()) sound.stop()
        this.npcVoice.clear()
    }

    public setMap(
        {
            footsteps,
            buildings,
            ambientTerrain,
        }: {
            footsteps: FootstepMap
            buildings?: MapBuilding[]
            ambientTerrain?: AmbientTerrain
        },
        locationId?: string
    ): void {
        if (this.stopped) return
        this.invalidateWorld()
        this.characterAudio?.casts.reset()
        this.characterAudio?.deaths.reset()
        this.surfaceMap = footsteps
        if (locationId !== undefined) {
            this.ambience?.setMap(locationId, {
                buildings: buildings ?? [],
                tileWidth: footsteps.tileWidth,
                tileHeight: footsteps.tileHeight,
                ambientTerrain,
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

    public invalidateWorld(keepDeathVoice = false): void {
        this.clearWorldSounds(keepDeathVoice)
        this.npcVoice.clear()
        this.voiceWorld = { snapshot: undefined, playerId: undefined }
    }

    private readonly onVisibilityChange = (): void => {
        if (document.hidden) {
            this.music.pause()
            this.clearWorldSounds()
            this.npcVoice.clear()
        } else {
            this.resumeAudiblePlayback()
        }
    }

    private clearWorldSounds(keepDeathVoice = false): void {
        this.battleMusic.clear()
        this.music.setBattle(false)
        this.footsteps.reset()
        this.footstepAudio.stop()
        this.ambience?.clear()
        this.characterAudio?.casts.clear()
        if (keepDeathVoice) this.characterAudio?.deaths.clearObservation()
        else this.characterAudio?.deaths.clear()
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

    public playEventSound(event: GameEventPayload, serverTime?: number): void {
        if (this.stopped) return
        if (event.kind === 'chat') {
            this.npcVoice.receive(event)
            return
        }
        if (serverTime !== undefined) this.receiveWorldCue(event, serverTime)
        if (isMagicCastAttack(event) || (event.kind === 'attack' && !playsAttackSound(event)))
            return
        const sound = eventSounds.get(event.kind)
        if (sound) this.playSound(sound)
    }

    private receiveWorldCue(event: GameEventPayload, serverTime: number): void {
        this.battleMusic.receive(event, serverTime)
        if (!this.characterAudio) return
        const { casts, deaths } = this.characterAudio
        if (document.hidden || isAudioMuted()) {
            casts.clear()
            deaths.clear()
        }
        casts.receive(event, serverTime)
        deaths.receive(event, serverTime)
    }

    public observeWorld(
        snapshot: WorldSnapshot,
        localPlayerId: string | undefined,
        isPositionVisible?: (position: Vector2) => boolean,
        isCharacterVisible?: (actorId: string) => boolean
    ): void {
        if (this.stopped || this.worldSuspended) return
        this.voiceWorld = { snapshot, playerId: localPlayerId }
        this.npcVoice.refresh()
        const map = this.surfaceMap
        if (map === undefined || document.hidden || isAudioMuted()) return
        const listener = snapshot.characters.find((actor) => actor.id === localPlayerId)
        if (!listener?.alive) {
            this.clearWorldSounds(listener !== undefined)
            return
        }
        if (isPositionVisible) this.ambience?.observeWorld(snapshot, listener.id, isPositionVisible)
        this.observeBattle(snapshot, listener.id)
        if (isCharacterVisible && this.characterAudio) {
            this.characterAudio.casts.observeWorld(snapshot, listener.id, map, isCharacterVisible)
            this.characterAudio.deaths.observeWorld(snapshot, listener.id, map, isCharacterVisible)
        }
        this.observeFootsteps(snapshot, listener.id, map)
    }

    private observeBattle(snapshot: WorldSnapshot, localPlayerId: string): void {
        const forest = this.ambience?.inWoodland ?? false
        if (forest) this.music.prepareBattle()
        this.battleMusic.observe(snapshot, localPlayerId, forest)
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
