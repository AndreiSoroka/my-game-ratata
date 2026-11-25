import { CENTER_LOCATION_ID, type WorldLocation, worldLocationId } from '@my-game-ratata/contracts'
import { Future, Sound } from 'excalibur'

import { musicCatalog } from '../../src/game/assets/soundCatalog'
import { setAudioMuted } from '../../src/game/runtime/audioPreference'
import { GameAudio } from '../../src/game/runtime/gameAudio'
import { WorldAmbienceSounds } from '../../src/game/runtime/worldAmbienceSounds'
import { characterFixture, worldFixture } from '../../src/game/testing/characterFixture'
import { mountEngine, startEngine, stepUntil, type TestEngine } from './engineSupport'

const locationId = worldLocationId(1, 1)
const outskirtsId = worldLocationId(2, 1)
const dungeonId = 'dungeon-small'
const playerId = 'forest-player'
const enemyId = 'forest-enemy'
const serverTime = 100_000
const surfaceMap = {
    footsteps: { tileWidth: 16, tileHeight: 16, width: 32, height: 32, surfaces: [] },
}
const dungeonMap = { ...surfaceMap, dungeonLights: [] }
const hero = characterFixture(playerId, { position: { x: 80, y: 80 } })
const enemy = characterFixture(enemyId, {
    position: { x: 96, y: 80 },
    relationship: 'hostile',
})
const secondEnemy = { ...enemy, id: 'second-enemy' }

export async function verifyBattleMusic() {
    const run = mountEngine()
    const clips = createSoundtrackBank()
    const { bank, allowBattleLoad, battleDecoded } = clips
    const audio = new GameAudio(new Map(), bank)
    let enemiesVisible = true
    const isEnemyVisible = () => enemiesVisible
    const updateMusic = ({ elapsed }: { elapsed: number }) =>
        audio.updateMusic(elapsed, isEnemyVisible)
    const observe = (at: number, enemies = [enemy], visible = true) => {
        enemiesVisible = visible
        audio.observeWorld(world(at, locationId, enemies), playerId)
    }
    run.engine.on('postupdate', updateMusic)
    run.owner.addCleanup(() => {
        run.engine.off('postupdate', updateMusic)
        audio.stop()
        bank.dispose()
    })

    try {
        const { clock } = run
        await startEngine(run)
        const { city, explore, ...surfaceTransitions } = await checkSurfaceMaps(audio, clock, clips)

        observe(0, [])
        const beforeEnemy = explore.playingCount()
        observe(100)
        clock.step(16)
        const whileLoading = explore.playingCount()
        allowBattleLoad.resolve(undefined)
        const battle = await stepUntil(battleDecoded.promise, clock)
        const battleTransition = checkTransitions({ clock, audio, explore, battle, observe })
        setAudioMuted(false)

        audio.setMap(dungeonMap, dungeonId)
        audio.observeWorld(world(24_000, dungeonId, [enemy]), playerId)
        clock.run(30, 16)
        const dungeonWithEnemy = {
            exploration: city.playingCount() + explore.playingCount(),
            battle: battle.playingCount(),
        }
        audio.observeWorld(world(32_500, dungeonId, []), playerId)
        clock.run(185, 16)
        const dungeonAfterRetreat =
            city.playingCount() + explore.playingCount() + battle.playingCount()
        audio.setMap(surfaceMap, CENTER_LOCATION_ID)
        clock.step(16)
        const cityAfterDungeon = {
            city: city.playingCount(),
            battle: battle.playingCount(),
        }
        return {
            ...surfaceTransitions,
            beforeEnemy,
            whileLoading,
            battleDuration: battle.data.duration,
            explorationDuration: explore.data.duration,
            ...battleTransition,
            dungeonWithEnemy,
            dungeonAfterRetreat,
            cityAfterDungeon,
        }
    } finally {
        clips.allowExploreLoad.resolve(undefined)
        allowBattleLoad.resolve(undefined)
        await run.owner.cancel()
        setAudioMuted(false)
    }
}

function createSoundtrackBank() {
    const cityDecoded = new Future<Sound>()
    const exploreRequested = new Future<void>()
    const allowExploreLoad = new Future<void>()
    const exploreDecoded = new Future<Sound>()
    const allowBattleLoad = new Future<void>()
    const battleDecoded = new Future<Sound>()
    const bank = new WorldAmbienceSounds(async (src, signal) => {
        if (src === musicCatalog.forestExploration.src) {
            exploreRequested.resolve(undefined)
            await allowExploreLoad.promise
        }
        if (src === musicCatalog.forestBattle.src) await allowBattleLoad.promise
        const response = await fetch(src, { signal })
        if (!response.ok) throw new Error(`Could not load ${src}`)
        const sound = await Sound.fromBlob(await response.blob())
        if (src === musicCatalog.adventureBegins.src) cityDecoded.resolve(sound)
        if (src === musicCatalog.forestExploration.src) exploreDecoded.resolve(sound)
        if (src === musicCatalog.forestBattle.src) battleDecoded.resolve(sound)
        return sound
    })
    return {
        bank,
        cityDecoded,
        exploreRequested,
        allowExploreLoad,
        exploreDecoded,
        allowBattleLoad,
        battleDecoded,
    }
}

async function checkSurfaceMaps(
    audio: GameAudio,
    clock: TestEngine['clock'],
    {
        cityDecoded,
        exploreRequested,
        allowExploreLoad,
        exploreDecoded,
    }: ReturnType<typeof createSoundtrackBank>
) {
    audio.setMap(surfaceMap, CENTER_LOCATION_ID)
    audio.playMusic()
    const city = await stepUntil(cityDecoded.promise, clock)
    clock.step(16)
    const cityTrack = city.instances[0]
    const cityLoop = cityTrack?.isPlaying && cityTrack.loop

    audio.setMap(surfaceMap, outskirtsId)
    const leftCity = cityTrack?.isStopped
    await stepUntil(exploreRequested.promise, clock)
    audio.setMap(dungeonMap, dungeonId)
    allowExploreLoad.resolve(undefined)
    const explore = await stepUntil(exploreDecoded.promise, clock)
    clock.step(16)
    const silentAfterLateDecode = city.playingCount() + explore.playingCount() === 0

    audio.setMap(surfaceMap, outskirtsId)
    clock.step(16)
    const explorationTrack = explore.instances[0]
    audio.setMap(surfaceMap, locationId)
    clock.step(16)
    const keptExplorationTrack =
        explorationTrack?.isPlaying &&
        explorationTrack.loop &&
        explore.instances[0] === explorationTrack
    return { city, explore, cityLoop, leftCity, silentAfterLateDecode, keptExplorationTrack }
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
    observe: (at: number, enemies?: (typeof enemy)[], visible?: boolean) => void
}) {
    clock.run(45, 16)
    const original = explore.instances[0]
    const loop = battle.instances[0]
    if (!original || !loop) throw new Error('Both soundtrack tracks must exist during the fade')
    const gains = () => [original.volume, loop.volume] as const
    const fadeIn = gains()

    clock.run(120, 16)
    const nearEnemy = { pausedExploration: original.isPaused, loop: loop.loop }
    observe(500, [enemy], false)
    clock.step(16)
    observe(6000)
    clock.step(16)
    const returnedBeforeFade = battle.instances[0] === loop && loop.isPlaying && original.isPaused

    audio.playEventSound(
        { kind: 'death', actorId: playerId, targetId: enemyId, locationId },
        serverTime + 6100
    )
    observe(13800, [])
    clock.step(16)
    const heldAfterDeath = loop.isPlaying && original.isPaused
    observe(14200, [])
    clock.run(30, 16)
    const fadingOut = gains()

    observe(14500, [secondEnemy])
    clock.run(14, 16)
    const reversed = gains()
    const reusedBattle = battle.instances[0] === loop && battle.playingCount() === 1

    observe(22900, [])
    clock.run(185, 16)
    const afterRetreat = {
        battleStopped: loop.isStopped,
        resumedExploration: explore.instances[0] === original && original.isPlaying,
        explorationGain: original.volume,
    }
    observe(23000, [secondEnemy])
    clock.run(30, 16)
    const restartedFromProximity =
        battle.playingCount() === 1 &&
        battle.instances.some((track) => track.isPlaying && track !== loop)
    const tracksBeforeMute = explore.playingCount() + battle.playingCount()
    setAudioMuted(true)
    const tracksAfterMute = explore.playingCount() + battle.playingCount()

    return {
        fadeIn,
        nearEnemy,
        returnedBeforeFade,
        heldAfterDeath,
        fadingOut,
        reversed,
        reusedBattle,
        afterRetreat,
        restartedFromProximity,
        tracksBeforeMute,
        tracksAfterMute,
    }
}

function world(at: number, id: string, enemies: (typeof enemy)[]) {
    return {
        ...worldFixture([hero, ...enemies], serverTime + at),
        location: { id } as WorldLocation,
    }
}
