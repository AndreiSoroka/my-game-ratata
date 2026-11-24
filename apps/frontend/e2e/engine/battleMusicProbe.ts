import { type WorldLocation, worldLocationId } from '@my-game-ratata/contracts'
import { DefaultLoader, Future, Sound } from 'excalibur'

import { musicCatalog } from '../../src/game/assets/soundCatalog'
import { createCharacterResources } from '../../src/game/runtime/characterResources'
import { GameAudio } from '../../src/game/runtime/gameAudio'
import { WorldAmbience } from '../../src/game/runtime/worldAmbience'
import { WorldAmbienceSounds } from '../../src/game/runtime/worldAmbienceSounds'
import {
    adventureFixture,
    characterFixture,
    worldFixture,
} from '../../src/game/testing/characterFixture'
import { mountEngine, startEngine, stepUntil } from './engineSupport'

const locationId = worldLocationId(1, 1)
const playerId = 'forest-player'
const enemyId = 'forest-enemy'
const tileSize = 16
const serverTime = 100_000
const footsteps = { tileWidth: tileSize, tileHeight: tileSize, width: 32, height: 32, surfaces: [] }

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
    const updateMusic = () => audio.updateMusic()
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
        const original = explore.instances[0]
        if (!original) throw new Error('Default music did not start')

        audio.observeWorld(
            forest(),
            playerId,
            () => true,
            () => true
        )
        const beforeFight = explore.playingCount()
        audio.playEventSound(
            { kind: 'damage', actorId: enemyId, targetId: playerId, locationId },
            serverTime + 100
        )
        const whileLoading = explore.playingCount()

        const battle = await stepUntil(battleDecoded.promise, run.clock)
        run.clock.step(16)
        const loop = battle.instances[0]
        if (!loop) throw new Error('Battle music did not start')
        const duringFight = {
            pausedDefault: original.isPaused,
            defaultPlaying: explore.playingCount(),
            battlePlaying: battle.playingCount(),
            loop: loop.loop,
        }

        audio.playEventSound(
            { kind: 'death', actorId: playerId, targetId: enemyId, locationId },
            serverTime + 200
        )
        run.clock.step(16)
        return {
            beforeFight,
            whileLoading,
            duringFight,
            duration: battle.data.duration,
            afterFight: {
                battleStopped: loop.isStopped,
                resumedDefault: explore.instances[0] === original,
                defaultPlaying: explore.playingCount(),
            },
        }
    } finally {
        await run.owner.cancel()
    }
}

function forest() {
    const adventure = adventureFixture()
    adventure.resourceNodes = [80, 96, 112].map((x) => ({
        id: `tree-${x}`,
        locationId,
        kind: 'wood',
        source: 'tree',
        treeSize: 'adult',
        phase: 'ready',
        position: { x, y: 96 },
        remaining: 6,
    }))
    const world = worldFixture(
        [
            characterFixture(playerId, { position: { x: 80, y: 80 } }),
            characterFixture(enemyId, { position: { x: 96, y: 80 } }),
        ],
        serverTime
    )
    return { ...world, location: { id: locationId, biome: 'wilds' } as WorldLocation, adventure }
}
