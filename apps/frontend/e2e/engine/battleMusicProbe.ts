import { type WorldLocation, worldLocationId } from '@my-game-ratata/contracts'
import { DefaultLoader, Future, Sound } from 'excalibur'

import { musicCatalog } from '../../src/game/assets/soundCatalog'
import { setAudioMuted } from '../../src/game/runtime/audioPreference'
import { createCharacterResources } from '../../src/game/runtime/characterResources'
import { GameAudio } from '../../src/game/runtime/gameAudio'
import { WorldAmbience } from '../../src/game/runtime/worldAmbience'
import { WorldAmbienceSounds } from '../../src/game/runtime/worldAmbienceSounds'
import {
    adventureFixture,
    characterFixture,
    worldFixture,
} from '../../src/game/testing/characterFixture'
import { mountEngine, startEngine, stepUntil, type TestEngine } from './engineSupport'

const locationId = worldLocationId(1, 1)
const playerId = 'forest-player'
const enemyId = 'forest-enemy'
const tileSize = 16
const serverTime = 100_000
const footsteps = { tileWidth: tileSize, tileHeight: tileSize, width: 32, height: 32, surfaces: [] }
const hero = characterFixture(playerId, { position: { x: 80, y: 80 } })
const enemy = characterFixture(enemyId, {
    position: { x: 96, y: 80 },
    relationship: 'hostile',
})
const secondEnemy = { ...enemy, id: 'second-enemy' }

export async function verifyBattleMusic(context: AudioContext) {
    const run = mountEngine()
    const explore = createCharacterResources().music.adventureBegins
    const battleDecoded = new Future<Sound>()
    const bank = new WorldAmbienceSounds(async (src, signal) => {
        const response = await fetch(src, { signal })
        if (!response.ok) throw new Error(`Could not load ${src}`)
        const sound = await Sound.fromBlob(await response.blob())
        if (src === musicCatalog.forestBattle.src) battleDecoded.resolve(sound)
        return sound
    })
    const ambience = new WorldAmbience(run.engine, { sounds: bank, audioContext: () => context })
    const audio = new GameAudio(new Map(), explore, ambience, undefined, bank)
    let enemiesVisible = true
    const isEnemyVisible = () => enemiesVisible
    const updateMusic = ({ elapsed }: { elapsed: number }) =>
        audio.updateMusic(elapsed, isEnemyVisible)
    const observe = (at: number, woodland: boolean, enemies = [enemy], visible = true) => {
        enemiesVisible = visible
        audio.observeWorld(world(at, woodland, enemies), playerId, () => true)
    }
    run.engine.on('postupdate', updateMusic)
    run.owner.addCleanup(() => {
        run.engine.off('postupdate', updateMusic)
        audio.stop()
        bank.dispose()
    })

    try {
        await startEngine(run, new DefaultLoader({ loadables: [explore] }))
        audio.setMap({ footsteps, buildings: [] }, locationId)
        audio.startWorldAmbience()
        audio.playMusic()
        observe(0, true)
        const beforeFight = explore.playingCount()
        hit(audio, enemyId, 100)
        const whileLoading = explore.playingCount()
        const battle = await stepUntil(battleDecoded.promise, run.clock)
        return {
            beforeFight,
            whileLoading,
            duration: battle.data.duration,
            ...checkTransitions({ clock: run.clock, audio, explore, battle, observe }),
        }
    } finally {
        await run.owner.cancel()
        setAudioMuted(false)
    }
}

function checkTransitions({
    clock,
    audio,
    explore,
    battle,
    observe,
}: {
    clock: TestEngine['clock']
    audio: GameAudio
    explore: Sound
    battle: Sound
    observe: (at: number, woodland: boolean, enemies?: (typeof enemy)[], visible?: boolean) => void
}) {
    clock.run(45, 16)
    const original = explore.instances[0]
    const loop = battle.instances[0]
    if (!original || !loop) throw new Error('Both soundtrack tracks must exist during the fade')
    const gains = () => [original.volume, loop.volume] as const
    const fadeIn = gains()

    clock.run(120, 16)
    const duringFight = { pausedDefault: original.isPaused, loop: loop.loop }
    observe(500, false, [enemy], false)
    clock.step(16)
    observe(6000, false)
    clock.step(16)
    const returnedBeforeFade = battle.instances[0] === loop && loop.isPlaying && original.isPaused

    audio.playEventSound(
        { kind: 'death', actorId: playerId, targetId: enemyId, locationId },
        serverTime + 6100
    )
    observe(13800, false, [])
    clock.step(16)
    const heldAfterDeath = loop.isPlaying && original.isPaused
    observe(14200, false, [])
    clock.run(30, 16)
    const fadingOut = gains()

    observe(14500, false, [secondEnemy])
    clock.run(14, 16)
    const reversed = gains()
    const reusedBattle = battle.instances[0] === loop && battle.playingCount() === 1

    observe(22900, false, [], false)
    clock.run(185, 16)
    const afterFight = {
        battleStopped: loop.isStopped,
        resumedDefault: explore.instances[0] === original && original.isPlaying,
        defaultGain: original.volume,
    }
    observe(23000, false, [secondEnemy])
    clock.step(16)
    const noRestartFromSight = battle.playingCount() === 0

    observe(23300, true, [secondEnemy])
    hit(audio, secondEnemy.id, 23400)
    clock.run(30, 16)
    const tracksBeforeMute = explore.playingCount() + battle.playingCount()
    setAudioMuted(true)
    const tracksAfterMute = explore.playingCount() + battle.playingCount()

    return {
        fadeIn,
        duringFight,
        returnedBeforeFade,
        heldAfterDeath,
        fadingOut,
        reversed,
        reusedBattle,
        afterFight,
        noRestartFromSight,
        tracksBeforeMute,
        tracksAfterMute,
    }
}

function hit(audio: GameAudio, actorId: string, at: number): void {
    audio.playEventSound(
        { kind: 'damage', actorId, targetId: playerId, locationId },
        serverTime + at
    )
}

function world(at: number, woodland: boolean, enemies: (typeof enemy)[]) {
    const adventure = adventureFixture()
    adventure.resourceNodes = (woodland ? [80, 96, 112] : []).map((x) => ({
        id: `tree-${x}`,
        locationId,
        kind: 'wood',
        source: 'tree',
        treeSize: 'adult',
        phase: 'ready',
        position: { x, y: 96 },
        remaining: 6,
    }))
    return {
        ...worldFixture([hero, ...enemies], serverTime + at),
        location: { id: locationId, biome: 'wilds' } as WorldLocation,
        adventure,
    }
}
