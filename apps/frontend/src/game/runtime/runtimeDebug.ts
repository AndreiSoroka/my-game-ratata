import type { WorldSnapshot } from '@my-game-ratata/contracts'
import { type Engine, vec } from 'excalibur'

import type { SceneActors } from './sceneActors'

export function updateRuntimeDebug(
    view: { engine: Engine; sceneActors: Pick<SceneActors, 'buildingCoverStates'> } | undefined,
    snapshot: WorldSnapshot | undefined,
    localPlayerId: string | undefined
): void {
    if (!import.meta.env.DEV) return
    const engine = view?.engine
    window.__ratataGameDebug = {
        lastSnapshot: snapshot,
        localPlayerId,
        buildingCovers: () => view?.sceneActors.buildingCoverStates() ?? [],
        ...(new URLSearchParams(window.location.search).get('test') === '1'
            ? {
                  setCameraZoom: (zoom: number) => {
                      if (!engine || !Number.isFinite(zoom) || zoom < 1 || zoom > 4) return false
                      engine.currentScene.camera.zoom = zoom
                      return true
                  },
                  captureFrame: async () => (engine ? (await engine.screenshot()).src : undefined),
              }
            : {}),
        worldToPage: (point) => {
            const pagePoint = engine?.screen.worldToPageCoordinates(vec(point.x, point.y))
            return pagePoint === undefined ? undefined : { x: pagePoint.x, y: pagePoint.y }
        },
    }
}
