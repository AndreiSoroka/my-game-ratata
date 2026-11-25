import type { DungeonRevealSnapshot, Vector2 } from '@my-game-ratata/contracts'

import type { DungeonSecretDefinition } from './dungeonSecretData'
import { createItemInstance } from './inventory'
import { distance } from './math'
import type { MapGrid, NavigationService } from './navigation'
import { firstSolidImpact } from './tileRay'
import type { WorldInventory } from './worldInventory'

export class DungeonSecrets {
    private opened: DungeonRevealSnapshot[] = []
    public spawnGuards?: (
        secretId: string,
        positions: readonly Vector2[]
    ) => void

    public constructor(
        private readonly definitions: readonly DungeonSecretDefinition[],
        private readonly navigation: NavigationService,
        private readonly inventory: WorldInventory
    ) {}

    public get closedWall(): DungeonSecretDefinition | undefined {
        return this.definitions[this.opened.length]
    }

    public get snapshot(): DungeonRevealSnapshot[] {
        return this.opened
    }

    public draftAt(position: Vector2, walking: boolean): boolean {
        const wall = this.closedWall
        const { grid } = this.navigation
        if (
            wall === undefined ||
            !withinDraftRange(position, wall.position, grid, walking) ||
            this.navigation.isSolidTile(this.navigation.worldToTile(position))
        ) {
            return false
        }
        const tile = this.navigation.worldToTile(wall.position)
        const impact = firstSolidImpact(grid, position, wall.position)
        return impact?.tile.x === tile.x && impact.tile.y === tile.y
    }

    public damage(id: string, amount: number): boolean {
        const secret = this.closedWall
        if (secret?.id !== id || !Number.isFinite(amount) || amount <= 0) {
            return false
        }
        const { cells, reward } = secret
        this.navigation.applyDungeonReveal(cells)
        this.opened = [...this.opened, { id, cells }]
        if (reward !== undefined) {
            const { x, y, items } = reward.chest
            this.inventory.containers.register({
                id: `${id}:chest`,
                position: { x, y },
                opened: false,
                contents: items.map(({ itemId, quantity }) =>
                    createItemInstance(itemId, quantity)
                ),
            })
            this.spawnGuards?.(id, reward.guards)
        }
        return true
    }
}

function withinDraftRange(
    listener: Vector2,
    wall: Vector2,
    { tileWidth, tileHeight }: Pick<MapGrid, 'tileWidth' | 'tileHeight'>,
    walking: boolean
): boolean {
    const tileSize = Math.min(tileWidth, tileHeight)
    if (walking) {
        return distance(listener, wall) <= 2 * tileSize
    }

    const fromFaceX = Math.max(0, Math.abs(listener.x - wall.x) - tileWidth / 2)
    const fromFaceY = Math.max(
        0,
        Math.abs(listener.y - wall.y) - tileHeight / 2
    )
    return Math.hypot(fromFaceX, fromFaceY) <= tileSize / 2 + 1e-4
}
