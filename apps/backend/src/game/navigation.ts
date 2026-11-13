import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
    GroundSurface,
    MapSummary,
    Vector2,
} from '@my-game-ratata/contracts'
import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

import { clamp } from './math'
import { readNavigationSurfaces } from './navigationSurfaces'
import { findPath } from './pathfinding'

export interface TileCoordinate {
    x: number
    y: number
}

export interface MapGrid {
    surfaces?: GroundSurface[]
    height: number
    id: string
    solid: boolean[]
    solidLayerNames: string[]
    tileHeight: number
    tileWidth: number
    width: number
}

interface TiledProperty {
    name: string
    type: string
    value: unknown
}

interface TiledLayer {
    data?: number[]
    height: number
    name: string
    properties?: TiledProperty[]
    type: string
    width: number
}

interface TiledMap {
    height: number
    layers: TiledLayer[]
    tileheight: number
    tilewidth: number
    width: number
}

export class NavigationService {
    public readonly grid: MapGrid
    public readonly summary: MapSummary

    public constructor(grid: MapGrid) {
        this.grid = grid
        this.summary = {
            height: grid.height,
            id: grid.id,
            solidLayerNames: grid.solidLayerNames,
            tileHeight: grid.tileHeight,
            tileWidth: grid.tileWidth,
            width: grid.width,
            worldHeight: grid.height * grid.tileHeight,
            worldWidth: grid.width * grid.tileWidth,
        }
    }

    public worldToTile(point: Vector2): TileCoordinate {
        return {
            x: Math.floor(point.x / this.grid.tileWidth),
            y: Math.floor(point.y / this.grid.tileHeight),
        }
    }

    public tileToWorld(tile: TileCoordinate): Vector2 {
        return {
            x: tile.x * this.grid.tileWidth + this.grid.tileWidth / 2,
            y: tile.y * this.grid.tileHeight + this.grid.tileHeight / 2,
        }
    }

    public isSolidTile(tile: TileCoordinate): boolean {
        return isSolidTile(this.grid, tile)
    }

    public findPathWorld(from: Vector2, to: Vector2): Vector2[] {
        const start = this.worldToTile(from)
        const destination = this.clampWorld(to)
        const end = this.worldToTile(destination)
        const tiles = findPath(this.grid, start, end)

        if (tiles.length <= 1) {
            return this.isSolidTile(end) ? [] : [destination]
        }

        return tiles.slice(1).map((tile) => this.tileToWorld(tile))
    }

    public clampWorld(point: Vector2): Vector2 {
        const halfW = this.grid.tileWidth / 2
        const halfH = this.grid.tileHeight / 2

        return {
            x: clamp(point.x, halfW, this.summary.worldWidth - halfW),
            y: clamp(point.y, halfH, this.summary.worldHeight - halfH),
        }
    }

    public surfaceAt(point: Vector2): GroundSurface {
        const tile = this.worldToTile(point)
        return (
            this.grid.surfaces?.[tile.y * this.grid.width + tile.x] ?? 'grass'
        )
    }

    public moveWithCollision(position: Vector2, delta: Vector2): Vector2 {
        const stepSize = Math.min(this.grid.tileWidth, this.grid.tileHeight) / 4
        const steps = Math.max(
            1,
            Math.ceil(Math.hypot(delta.x, delta.y) / stepSize)
        )
        const step = { x: delta.x / steps, y: delta.y / steps }
        let result = { ...position }
        for (let index = 0; index < steps; index += 1) {
            result = this.moveStep(result, step)
        }
        return result
    }

    private moveStep(position: Vector2, delta: Vector2): Vector2 {
        const target = this.clampWorld({
            x: position.x + delta.x,
            y: position.y + delta.y,
        })

        if (
            !this.isSolidTile(this.worldToTile(target)) &&
            !this.cutsCorner(position, target)
        ) {
            return target
        }

        return this.slideMove(position, delta)
    }

    public hasLineOfSight(from: Vector2, to: Vector2): boolean {
        const steps = Math.max(
            1,
            Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 8)
        )

        for (let index = 1; index <= steps; index += 1) {
            const ratio = index / steps
            const point = {
                x: from.x + (to.x - from.x) * ratio,
                y: from.y + (to.y - from.y) * ratio,
            }

            if (this.isSolidTile(this.worldToTile(point))) {
                return false
            }
        }

        return true
    }

    public walkableNeighbors(tile: TileCoordinate): TileCoordinate[] {
        return [
            { x: tile.x + 1, y: tile.y },
            { x: tile.x - 1, y: tile.y },
            { x: tile.x, y: tile.y + 1 },
            { x: tile.x, y: tile.y - 1 },
        ].filter((candidate) => !this.isSolidTile(candidate))
    }

    private cutsCorner(from: Vector2, to: Vector2): boolean {
        return (
            this.isSolidTile(this.worldToTile({ x: from.x, y: to.y })) &&
            this.isSolidTile(this.worldToTile({ x: to.x, y: from.y }))
        )
    }

    private slideMove(position: Vector2, delta: Vector2): Vector2 {
        const xOnly = this.clampWorld({
            x: position.x + delta.x,
            y: position.y,
        })

        if (!this.isSolidTile(this.worldToTile(xOnly))) {
            return xOnly
        }

        const yOnly = this.clampWorld({
            x: position.x,
            y: position.y + delta.y,
        })

        if (!this.isSolidTile(this.worldToTile(yOnly))) {
            return yOnly
        }

        return { ...position }
    }
}

export function isSolidTile(grid: MapGrid, tile: TileCoordinate): boolean {
    if (tile.x < 0 || tile.y < 0) {
        return true
    }

    if (tile.x >= grid.width || tile.y >= grid.height) {
        return true
    }

    return grid.solid[tile.y * grid.width + tile.x] === true
}

export function loadNavigationService(
    mapId: string = CENTER_LOCATION_ID
): NavigationService {
    const mapRoot = resolveMapRoot()
    const raw = fs.readFileSync(path.join(mapRoot, `${mapId}.json`), 'utf-8')
    const map = JSON.parse(raw) as TiledMap

    return new NavigationService(buildGrid(mapId, map))
}

function resolveMapRoot(): string {
    const envRoot = Bun.env['GAME_MAP_ROOT']

    if (envRoot !== undefined && envRoot.trim().length > 0) {
        return path.resolve(envRoot)
    }

    const currentDir = path.dirname(fileURLToPath(import.meta.url))
    const repoRoot = path.resolve(currentDir, '../../../..')

    return path.join(repoRoot, 'apps/frontend/public/game/map')
}

function buildGrid(mapId: string, map: TiledMap): MapGrid {
    const solid = new Array<boolean>(map.width * map.height).fill(false)
    const solidLayerNames: string[] = []

    for (const layer of map.layers) {
        if (layer.type !== 'tilelayer' || layer.data === undefined) {
            continue
        }

        if (!isSolidLayer(layer)) {
            continue
        }

        solidLayerNames.push(layer.name)
        markSolidTiles(solid, layer.data)
    }

    return {
        surfaces: readNavigationSurfaces(map),
        height: map.height,
        id: mapId,
        solid,
        solidLayerNames,
        tileHeight: map.tileheight,
        tileWidth: map.tilewidth,
        width: map.width,
    }
}

function isSolidLayer(layer: TiledLayer): boolean {
    const solidProperty = layer.properties?.find(
        (property) => property.name === 'solid'
    )

    return layer.name === 'Fence' || solidProperty?.value === true
}

function markSolidTiles(solid: boolean[], tileIds: number[]): void {
    for (let index = 0; index < tileIds.length; index += 1) {
        if (tileIds[index] !== 0) {
            solid[index] = true
        }
    }
}
