import { createCharacterResources } from './characterResources'
import { GameAudio } from './gameAudio'
import { MagicViews } from './magicViews'
import { PrayerAreaViews } from './prayerAreaViews'
import { createGameCanvas, createGameEngine } from './runtimeCharacterTargets'
import { SceneActors } from './sceneActors'
import type { RenderedTiledMap } from './tiledMap'

/** Construct the scene only once its map belongs to a still-active startup. */
export function createRuntimePresentation(container: HTMLElement, map: RenderedTiledMap) {
    const canvas = createGameCanvas(container)
    const engine = createGameEngine(canvas)
    const resources = createCharacterResources()
    const audio = new GameAudio(resources.sounds, resources.music.adventureBegins)
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
    sceneActors.addMap(map)
    return { canvas, engine, audio, sceneActors, loader: resources.loader }
}
