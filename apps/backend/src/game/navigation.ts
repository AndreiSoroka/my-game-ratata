import type {
    AuthoredContainerDefinition,
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
    dungeonPassage?: DungeonPassage
    dungeonSkeletons?: readonly Vector2[]
    training?: TrainingMapData
    /** Immutable terrain/walls, excluding authored harvestable obstacles. */
    baseSolid?: boolean[]
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
        for (const area of bounds) {
            for (const index of this.cellsInBounds(area)) {
                solid[index] = true
            }
        }
        this.solidsWithoutDoors = solid
        this.grid.solid = this.doors.withCollision(solid)
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
        const cells: number[] = []
        const { tileWidth, tileHeight, width, height } = this.grid
        for (
            let y = Math.floor(bounds.y / tileHeight);
            y < Math.ceil((bounds.y + bounds.height) / tileHeight);
            y++
        ) {
            for (
                let x = Math.floor(bounds.x / tileWidth);
                x < Math.ceil((bounds.x + bounds.width) / tileWidth);
                x++
            ) {
                if (x >= 0 && y >= 0 && x < width && y < height) {
                    cells.push(y * width + x)
                }
            }
        }
        return cells
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
        throughUnlockedDoors = false
    ): Vector2[] {
        const start = this.worldToTile(from)
        const destination = this.clampWorld(to)
        const end = this.worldToTile(destination)
        const grid = throughUnlockedDoors
            ? { ...this.grid, solid: this.solidsWithoutDoors }
            : this.grid
        const tiles = findPath(grid, start, end)

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
        return this.visibleLineFraction(from, to) === 1
    }

    public visibleLineEndpoint(from: Vector2, to: Vector2): Vector2 {
        const fraction = this.visibleLineFraction(from, to)
        return {
            x: from.x + (to.x - from.x) * fraction,
            y: from.y + (to.y - from.y) * fraction,
        }
    }

    private visibleLineFraction(from: Vector2, to: Vector2): number {
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
                return (index - 1) / steps
            }
        }

        return 1
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
