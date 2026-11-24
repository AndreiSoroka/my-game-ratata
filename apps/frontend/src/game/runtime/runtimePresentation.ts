import { CastAudio } from './castAudio'
import { createCharacterResources } from './characterResources'
import { EngineRun } from './engineRun'
import { GameAudio } from './gameAudio'
import { HumanDeathAudio } from './humanDeathAudio'
import { MagicViews } from './magicViews'
import { PrayerAreaViews } from './prayerAreaViews'
import { createGameCanvas, createGameEngine } from './runtimeCharacterTargets'
import { SceneActors } from './sceneActors'
import { selectionIntersectsViewport } from './selectionViewport'
import type { RenderedTiledMap } from './tiledMap'
import { WorldAmbience } from './worldAmbience'
import { WorldAmbienceSounds } from './worldAmbienceSounds'

/** Construct the scene only once its map belongs to a still-active startup. */
export function createRuntimePresentation(
    container: HTMLElement,
    map: RenderedTiledMap,
    locationId: string
) {
    // Keep the canvas parent available to Excalibur's FillContainer cleanup after detaching it.
    const surface = document.createElement('div')
    surface.className = 'game-canvas-surface'
    container.append(surface)
    const canvas = createGameCanvas(surface)
    canvas.style.visibility = 'hidden'
    const run = new EngineRun(canvas, () => createGameEngine(canvas), surface)
    const { engine } = run
    try {
        const resources = createCharacterResources()
        const sounds = new WorldAmbienceSounds()
        run.addCleanup(() => sounds.dispose())
        const casts = new CastAudio(sounds)
        const audio = new GameAudio(
            resources.sounds,
            resources.music.adventureBegins,
            new WorldAmbience(engine, { sounds }),
            { casts, deaths: new HumanDeathAudio(sounds) },
            sounds
        )
        run.addCleanup(() => audio.stop())
        audio.setMap(map, locationId)
        const sceneActors = new SceneActors(
            engine,
            resources.sheets,
            resources.itemImages,
            resources.chestImage,
            resources.farmImage,
            resources.bellImages,
            new MagicViews(engine, resources.fireImage),
            new PrayerAreaViews(engine, resources.prayerAreaImages)
        )
        run.addCleanup(() => sceneActors.dispose())
        const isBattleEnemyVisible = (id: string): boolean => {
            const position = sceneActors.characterPosition(id)
            return (
                position !== undefined &&
                sceneActors.isCharacterVisible(id) &&
                selectionIntersectsViewport(
                    { kind: 'character', position },
                    engine.currentScene.camera.viewport
                )
            )
        }
        const updateAudio = ({ elapsed }: { elapsed: number }) => {
            casts.update()
            audio.updateMusic(elapsed, isBattleEnemyVisible)
        }
        engine.on('postupdate', updateAudio)
        run.addCleanup(() => engine.off('postupdate', updateAudio))
        sceneActors.addMap(map)
        return { run, canvas, engine, audio, sceneActors, loader: resources.loader }
    } catch (error) {
        void run.cancel()
        throw error
    }
}
