import type { Vector2 } from '@my-game-ratata/contracts'
import { type CameraStrategy, vec } from 'excalibur'

import type { RenderedTiledMap } from './tiledMap'

type CameraMap = Pick<RenderedTiledMap, 'worldWidth' | 'worldHeight' | 'tileWidth' | 'tileHeight'>

export interface MapCameraBounds {
    left: number
    top: number
    right: number
    bottom: number
}

export function mapCameraBounds(map: CameraMap): MapCameraBounds {
    const horizontalMargin = map.tileWidth * 6
    const verticalMargin = map.tileHeight * 6
    return {
        left: -horizontalMargin,
        top: -verticalMargin,
        right: map.worldWidth + horizontalMargin,
        bottom: map.worldHeight + verticalMargin,
    }
}

/** Camera limits are presentation bounds; movement and target checks keep the real map bounds. */
export function mapCameraStrategy(map: CameraMap): CameraStrategy<MapCameraBounds> {
    return {
        target: mapCameraBounds(map),
        action: (bounds, camera, engine) => {
            const focus = clampMapCameraFocus(bounds, camera.getFocus(), {
                x: engine.drawWidth,
                y: engine.drawHeight,
            })
            return vec(focus.x, focus.y)
        },
    }
}

export function clampMapCameraFocus(
    bounds: MapCameraBounds,
    focus: Vector2,
    viewport: Vector2
): Vector2 {
    return {
        x: clampAxis(focus.x, bounds.left, bounds.right, viewport.x),
        y: clampAxis(focus.y, bounds.top, bounds.bottom, viewport.y),
    }
}

function clampAxis(focus: number, start: number, end: number, viewport: number): number {
    if (viewport >= end - start) return (start + end) / 2
    return Math.min(end - viewport / 2, Math.max(start + viewport / 2, focus))
}
