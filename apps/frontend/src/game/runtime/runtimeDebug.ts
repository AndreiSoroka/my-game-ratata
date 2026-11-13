import type { WorldSnapshot } from '@my-game-ratata/contracts'
import { type Engine, vec } from 'excalibur'

export function updateRuntimeDebug(
    engine: Engine | undefined,
    snapshot: WorldSnapshot | undefined,
    localPlayerId: string | undefined
): void {
    if (!import.meta.env.DEV) return
    window.__ratataGameDebug = {
        lastSnapshot: snapshot,
        localPlayerId,
        worldToPage: (point) => {
            const pagePoint = engine?.screen.worldToPageCoordinates(vec(point.x, point.y))
            return pagePoint === undefined ? undefined : { x: pagePoint.x, y: pagePoint.y }
        },
    }
}
