import type { DungeonRevealCell, DungeonRevealSnapshot } from '@my-game-ratata/contracts'

import type { FootstepMap, FootstepSurface } from './mapSurfaces'
import type { MapVisibility } from './mapVisibility'

interface DungeonRevealLayers {
    floor: number[]
    walls: number[]
    visibility: MapVisibility
    footsteps: FootstepMap
    surfaceLegend: ReadonlyMap<number, FootstepSurface>
    hasTile: (gid: number) => boolean
    redraw: (indices: ReadonlySet<number>) => void
}

/** Each receipt changes only the map that owns it, before movement and lighting read collision. */
export function createDungeonRevealUpdater(layers: DungeonRevealLayers) {
    const applied = new Set<string>()
    const { floor, walls, visibility, footsteps, surfaceLegend, hasTile, redraw } = layers
    const { width, height } = visibility
    const valid = (cell: DungeonRevealCell): boolean =>
        Number.isSafeInteger(cell.index) &&
        cell.index >= 0 &&
        cell.index < width * height &&
        validTile(cell.floorGid) &&
        validTile(cell.wallGid) &&
        (cell.surfaceGid === 0 || surfaceLegend.has(cell.surfaceGid)) &&
        typeof cell.solid === 'boolean'

    function validTile(gid: number): boolean {
        return gid === 0 || (Number.isSafeInteger(gid) && gid > 0 && hasTile(gid))
    }

    return (reveals: readonly DungeonRevealSnapshot[]): boolean => {
        const changed = new Set<number>()
        for (const { id, cells } of reveals) {
            if (applied.has(id) || !cells.length || !cells.every(valid)) continue
            applied.add(id)
            const base = (visibility.resourceBase ??= visibility.solid.slice())
            for (const cell of cells) {
                floor[cell.index] = cell.floorGid
                walls[cell.index] = cell.wallGid
                base[cell.index] = cell.solid
                footsteps.surfaces[cell.index] = surfaceLegend.get(cell.surfaceGid) ?? 'grass'
                changed.add(cell.index)
            }
        }
        if (!changed.size) return false
        delete visibility.obstacleSignature
        redraw(changed)
        return true
    }
}
