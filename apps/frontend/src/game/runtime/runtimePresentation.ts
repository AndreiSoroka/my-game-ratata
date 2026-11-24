import { createCharacterResources } from './characterResources'
import { EngineRun } from './engineRun'
import { GameAudio } from './gameAudio'
import { MagicViews } from './magicViews'
import { PrayerAreaViews } from './prayerAreaViews'
import { createGameCanvas, createGameEngine } from './runtimeCharacterTargets'
import { SceneActors } from './sceneActors'
import type { RenderedTiledMap } from './tiledMap'

/** Construct the scene only once its map belongs to a still-active startup. */
export function createRuntimePresentation(container: HTMLElement, map: RenderedTiledMap) {
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
        const audio = new GameAudio(resources.sounds, resources.music.adventureBegins)
        run.addCleanup(() => audio.stop())
        audio.setMap(map)
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
        sceneActors.addMap(map)
        return { run, canvas, engine, audio, sceneActors, loader: resources.loader }
    } catch (error) {
        void run.cancel()
        throw error
    }
}
