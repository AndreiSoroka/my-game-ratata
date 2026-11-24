import type { DoorState } from '@my-game-ratata/contracts'

import type { MapGrid, TileCoordinate } from './navigation'
import type { AuthoredDoor } from './worldObjectData'

export interface NavigationDoor extends AuthoredDoor {
    state: DoorState
    cell: number
}

export class NavigationDoors {
    private readonly byId = new Map<string, NavigationDoor>()
    private readonly byCell = new Map<number, NavigationDoor>()
    private readonly closed = new Set<number>()

    public constructor(private readonly grid: MapGrid) {
        for (const door of grid.doors ?? []) {
            this.register(door)
        }
    }

    public get(id: string): Readonly<NavigationDoor> | undefined {
        return this.byId.get(id)
    }

    public at(tile: TileCoordinate): Readonly<NavigationDoor> | undefined {
        const cell = this.cell(tile)
        return cell === undefined ? undefined : this.byCell.get(cell)
    }

    public set(id: string, state: 'open' | 'closed'): boolean {
        const door = this.byId.get(id)
        if (
            door === undefined ||
            door.state === 'locked' ||
            door.state === state
        ) {
            return false
        }
        door.state = state
        if (state === 'closed') {
            this.closed.add(door.cell)
        } else {
            this.closed.delete(door.cell)
        }
        return true
    }

    public withCollision(solid: boolean[]): boolean[] {
        if (this.closed.size === 0) {
            return solid
        }
        const combined = solid.slice()
        for (const cell of this.closed) {
            combined[cell] = true
        }
        return combined
    }

    private register(door: AuthoredDoor): void {
        const { bounds } = door
        const { tileWidth, tileHeight } = this.grid
        const x = bounds.x / tileWidth
        const y = bounds.y / tileHeight
        const cell = this.cell({ x, y })
        if (
            bounds.width !== tileWidth ||
            bounds.height !== tileHeight ||
            !Number.isInteger(x) ||
            !Number.isInteger(y) ||
            cell === undefined ||
            this.byId.has(door.id) ||
            this.byCell.has(cell) ||
            (door.initialState === 'locked') !== this.grid.solid[cell]
        ) {
            throw new Error(`Invalid authored door ${door.id}`)
        }
        const entry = { ...door, state: door.initialState, cell }
        this.byId.set(door.id, entry)
        this.byCell.set(cell, entry)
        if (entry.state === 'closed') {
            this.closed.add(cell)
        }
    }

    private cell({ x, y }: TileCoordinate): number | undefined {
        return x < 0 || x >= this.grid.width || y < 0 || y >= this.grid.height
            ? undefined
            : y * this.grid.width + x
    }
}
