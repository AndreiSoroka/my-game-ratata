import type {
    AuthoredContainerDefinition,
    DungeonRevealCell,
    GroundSurface,
    MapSummary,
    TrainingMapData,
    Vector2,
    WorldObjectBounds,
} from '@my-game-ratata/contracts'

import type { DungeonPassage } from './dungeonMapData'
import type { AuthoredEncounters } from './encounterData'
import type { MapBuildingDefinition } from './mapBuildings'
import type { MapLandmarkDefinition } from './mapLandmarks'
export { resolveMapRoot } from './mapFiles'
import { clamp } from './math'
import { type NavigationDoor, NavigationDoors } from './navigationDoors'
export { loadNavigationService } from './navigationLoader'
import {
    cellsInBounds,
    isSolidTile,
    passesSpeech,
    visibleLineFraction,
} from './navigationVisibility'
export { isSolidTile } from './navigationVisibility'
import { findPath } from './pathfinding'
import type { AuthoredDoor } from './worldObjectData'

export interface TileCoordinate {
    x: number
    y: number
}

export interface MapGrid {
    asset?: MapSummary['asset']
    cityAnchors?: Readonly<Record<string, Vector2>>
    cityAreas?: Readonly<Record<string, WorldObjectBounds>>
    landmarks?: MapLandmarkDefinition[]
    buildings?: MapBuildingDefinition[]
    containers?: AuthoredContainerDefinition[]
    doors?: AuthoredDoor[]
    encounters?: AuthoredEncounters
    dungeonPassages?: readonly DungeonPassage[]
    dungeonSkeletons?: readonly Vector2[]
    training?: TrainingMapData
    /** Terrain and walls, excluding authored harvestable obstacles. */
    baseSolid?: boolean[]
    speechTransparent?: ReadonlySet<number>
    /** Authored safe soil: independent of footstep sound and atlas tiles. */
    plantable?: boolean[]
    surfaces?: GroundSurface[]
    height: number
    id: string
    solid: boolean[]
    solidLayerNames: string[]
    tileHeight: number
    tileWidth: number
    width: number
}

export class NavigationService {
    public readonly grid: MapGrid
    public readonly summary: MapSummary
    private resourceBase: boolean[] | undefined
    private readonly resourceObstacleCells = new Set<number>()
    private solidsWithoutDoors: boolean[]
    private readonly doors: NavigationDoors

    public constructor(grid: MapGrid) {
        this.grid = grid
        this.resourceBase = grid.baseSolid?.slice()
        this.solidsWithoutDoors = grid.solid
        this.doors = new NavigationDoors(grid)
        this.grid.solid = this.doors.withCollision(this.solidsWithoutDoors)
        this.summary = {
            asset: grid.asset ?? {
                url: `/game/map/${grid.id}.json`,
                revision: 'static',
            },
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

    public setResourceObstacles(bounds: readonly WorldObjectBounds[]): void {
        this.resourceBase ??= this.solidsWithoutDoors.slice()
        const solid = this.resourceBase.slice()
        this.resourceObstacleCells.clear()
        for (const area of bounds) {
            for (const index of this.cellsInBounds(area)) {
                solid[index] = true
                this.resourceObstacleCells.add(index)
            }
        }
        this.solidsWithoutDoors = solid
        this.grid.solid = this.doors.withCollision(solid)
    }

    public applyDungeonReveal(cells: readonly DungeonRevealCell[]): void {
        for (const { index, solid, surfaceGid } of cells) {
            if (this.resourceBase !== undefined) {
                this.resourceBase[index] = solid
            }
            if (this.grid.baseSolid !== undefined) {
                this.grid.baseSolid[index] = solid
            }
            this.solidsWithoutDoors[index] =
                solid || this.resourceObstacleCells.has(index)
            if (this.grid.surfaces !== undefined) {
                this.grid.surfaces[index] = surfaceGid === 0 ? 'grass' : 'stone'
            }
        }
        this.grid.solid = this.doors.withCollision(this.solidsWithoutDoors)
    }

    public door(id: string): Readonly<NavigationDoor> | undefined {
        return this.doors.get(id)
    }

    public doorAt(point: Vector2): Readonly<NavigationDoor> | undefined {
        return this.doors.at(this.worldToTile(point))
    }

    public setDoorState(id: string, state: 'open' | 'closed'): boolean {
        const changed = this.doors.set(id, state)
        if (changed) {
            this.grid.solid = this.doors.withCollision(this.solidsWithoutDoors)
        }
        return changed
    }

    public cellsInBounds(bounds: WorldObjectBounds): number[] {
        return cellsInBounds(this.grid, bounds)
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

    public findWalkableTileNear(
        preferred: TileCoordinate,
        accepts: (tile: TileCoordinate) => boolean = () => true
    ): TileCoordinate | undefined {
        const origin = this.worldToTile(
            this.clampWorld(this.tileToWorld(preferred))
        )
        const limit = Math.max(this.grid.width, this.grid.height)
        for (let radius = 0; radius < limit; radius += 1) {
            for (let dy = -radius; dy <= radius; dy += 1) {
                for (let dx = -radius; dx <= radius; dx += 1) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
                        continue
                    }
                    const tile = { x: origin.x + dx, y: origin.y + dy }
                    if (!this.isSolidTile(tile) && accepts(tile)) {
                        return tile
                    }
                }
            }
        }
        return undefined
    }

    public findPathWorld(
        from: Vector2,
        to: Vector2,
        throughUnlockedDoors = false,
        canVisit?: (tile: TileCoordinate) => boolean
    ): Vector2[] {
        const start = this.worldToTile(from)
        const destination = this.clampWorld(to)
        const end = this.worldToTile(destination)
        const grid = throughUnlockedDoors
            ? { ...this.grid, solid: this.solidsWithoutDoors }
            : this.grid
        const tiles = findPath(grid, start, end, canVisit)

        if (tiles.length === 0) {
            return []
        }
        return [
            ...tiles.slice(1, -1).map((tile) => this.tileToWorld(tile)),
            destination,
        ]
    }

    public isPathBlocked(
        point: Vector2,
        throughUnlockedDoors: boolean
    ): boolean {
        const grid = throughUnlockedDoors
            ? { ...this.grid, solid: this.solidsWithoutDoors }
            : this.grid
        return isSolidTile(grid, this.worldToTile(point))
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

    public moveWithCollision(
        position: Vector2,
        delta: Vector2,
        onStep?: (from: Vector2, to: Vector2) => void
    ): Vector2 {
        const stepSize = Math.min(this.grid.tileWidth, this.grid.tileHeight) / 4
        const steps = Math.max(
            1,
            Math.ceil(Math.hypot(delta.x, delta.y) / stepSize)
        )
        const step = { x: delta.x / steps, y: delta.y / steps }
        let result = { ...position }
        for (let index = 0; index < steps; index += 1) {
            const next = this.moveStep(result, step)
            if (next.x !== result.x || next.y !== result.y) {
                onStep?.(result, next)
            }
            result = next
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
        return visibleLineFraction(this.grid, from, to) === 1
    }

    public hasSpeechLine(from: Vector2, to: Vector2): boolean {
        return this.grid.speechTransparent === undefined
            ? this.hasLineOfSight(from, to)
            : visibleLineFraction(this.grid, from, to, (tile) =>
                  passesSpeech(
                      this.grid,
                      tile,
                      this.resourceObstacleCells,
                      this.doors
                  )
              ) === 1
    }

    public visibleLineEndpoint(from: Vector2, to: Vector2): Vector2 {
        const fraction = visibleLineFraction(this.grid, from, to)
        return {
            x: from.x + (to.x - from.x) * fraction,
            y: from.y + (to.y - from.y) * fraction,
        }
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
