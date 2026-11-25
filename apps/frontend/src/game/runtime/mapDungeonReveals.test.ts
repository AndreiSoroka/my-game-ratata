import type {
    DungeonRevealCell,
    DungeonRevealSnapshot,
    WorldObjectSnapshot,
} from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import { dungeonRayDistance } from './dungeonShadow'
import { createDungeonRevealUpdater } from './mapDungeonReveals'
import type { FootstepMap } from './mapSurfaces'
import { mapHasLineOfSight, type MapVisibility, updateObstacleVisibility } from './mapVisibility'
import { redrawDungeonTiles } from './tiledMapRendering'

const outerWall = 6
const innerWall = 7
const floorGid = 2177
const wallGid = 3101

function cell(index: number, solid = false): DungeonRevealCell {
    return {
        index,
        solid,
        floorGid: solid ? 0 : floorGid,
        wallGid: solid ? wallGid : 0,
        surfaceGid: solid ? 0 : floorGid,
    }
}

const outer: DungeonRevealSnapshot = {
    id: 'outer',
    cells: [cell(outerWall), cell(innerWall, true)],
}
const inner: DungeonRevealSnapshot = { id: 'inner', cells: [cell(innerWall)] }

function fixture() {
    const base = {
        width: 5,
        height: 3,
        tileWidth: 16,
        tileHeight: 16,
    }
    const solid = Array.from(
        { length: 15 },
        (_, index) => index === outerWall || index === innerWall
    )
    const visibility: MapVisibility = { ...base, solid }
    const footsteps: FootstepMap = { ...base, surfaces: Array(15).fill('grass') }
    const floor = solid.map((blocked) => (blocked ? 0 : floorGid))
    const walls = solid.map((blocked) => (blocked ? wallGid : 0))
    const redraw = vi.fn<(indices: ReadonlySet<number>) => void>()
    const apply = createDungeonRevealUpdater({
        floor,
        walls,
        footsteps,
        visibility,
        surfaceLegend: new Map([[floorGid, 'stone']]),
        hasTile: (gid) => gid === floorGid || gid === wallGid,
        redraw,
    })
    return { apply, visibility, footsteps, floor, walls, redraw }
}

it('applies the full reveal in order on a fresh floor and ignores repeated receipts', () => {
    const { apply, visibility, footsteps, walls, floor, redraw } = fixture()
    expect(apply([])).toBe(false)
    expect(apply([outer, inner])).toBe(true)
    updateObstacleVisibility(visibility, [])
    expect(apply([outer, inner])).toBe(false)
    expect(apply([outer])).toBe(false)
    expect(walls.slice(outerWall, innerWall + 1)).toEqual([0, 0])
    expect(floor.slice(outerWall, innerWall + 1)).toEqual([floorGid, floorGid])
    expect(footsteps.surfaces.slice(outerWall, innerWall + 1)).toEqual(['stone', 'stone'])
    expect(visibility.solid.slice(outerWall, innerWall + 1)).toEqual([false, false])
    expect(redraw).toHaveBeenCalledExactlyOnceWith(new Set([outerWall, innerWall]))
})

it('updates the collision base, then preserves a different dynamic obstacle on the open cell', () => {
    const { apply, visibility } = fixture()
    const from = { x: 8, y: 24 }
    const to = { x: 56, y: 24 }
    const door: WorldObjectSnapshot = {
        id: 'door',
        kind: 'door',
        name: 'Дверь',
        position: { x: 24, y: 24 },
        bounds: { x: 16, y: 16, width: 16, height: 16 },
        depleted: false,
        door: { state: 'closed' },
    }
    const ray = () => dungeonRayDistance(visibility, from, { x: 1, y: 0 }, 64)
    updateObstacleVisibility(visibility, [], undefined, [door])
    expect(ray()).toBe(8)
    expect(apply([outer])).toBe(true)
    updateObstacleVisibility(visibility, [], undefined, [door])
    expect(ray()).toBe(8)
    expect(apply([outer, inner])).toBe(true)
    updateObstacleVisibility(visibility, [])
    expect(mapHasLineOfSight(visibility, from, to)).toBe(true)
    expect(ray()).toBe(64)
})

it('keeps the whole wall intact when a reveal contains an out-of-map or unknown tile', () => {
    const { apply, visibility, walls, redraw } = fixture()
    expect(apply([{ id: 'bad', cells: [cell(outerWall), cell(100)] }])).toBe(false)
    expect(
        apply([{ id: 'unknown', cells: [cell(outerWall), { ...cell(innerWall), floorGid: 7 }] }])
    ).toBe(false)
    expect(visibility.solid[outerWall]).toBe(true)
    expect(walls[outerWall]).toBe(wallGid)
    expect(redraw).not.toHaveBeenCalled()
})

it('erases the baked wall and repaints only the visible tile layers of the opening', () => {
    const context = {
        clearRect: vi.fn<CanvasRenderingContext2D['clearRect']>(),
        drawImage: vi.fn<CanvasRenderingContext2D['drawImage']>(),
    }
    const canvas = { getContext: () => context } as unknown as HTMLCanvasElement
    const image = {} as HTMLImageElement
    const layer = (name: string, gid: number, visible = true) => ({
        type: 'tilelayer',
        visible,
        name,
        data: Array.from({ length: 15 }, (_, index) => (index === outerWall ? gid : 0)),
    })
    redrawDungeonTiles(
        canvas,
        {
            width: 5,
            height: 3,
            tilewidth: 16,
            tileheight: 16,
            layers: [
                layer('Stone floor', 1),
                layer('Dungeon walls', 0),
                layer('Wall furnishings', 2),
                layer('Collision', 3, false),
            ],
        },
        [{ firstgid: 1, image, tileset: { columns: 3, image: '', tileheight: 16, tilewidth: 16 } }],
        new Set([outerWall])
    )
    expect(context.clearRect).toHaveBeenCalledExactlyOnceWith(16, 16, 16, 16)
    expect(context.drawImage.mock.calls).toEqual([
        [image, 0, 0, 16, 16, 16, 16, 16, 16],
        [image, 16, 0, 16, 16, 16, 16, 16, 16],
    ])
})
