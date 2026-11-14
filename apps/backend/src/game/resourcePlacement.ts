import type {
    AdventureResourceNode,
    Vector2,
    WorldObjectBounds,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'

export function containsPoint(
    bounds: WorldObjectBounds,
    point: Vector2
): boolean {
    return (
        point.x >= bounds.x &&
        point.x < bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y < bounds.y + bounds.height
    )
}

export function overlaps(a: WorldObjectBounds, b: WorldObjectBounds): boolean {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    )
}

export function occupied(
    bounds: WorldObjectBounds,
    characters: Iterable<GameCharacter>,
    locationId: string
): boolean {
    for (const actor of characters) {
        if (
            actor.locationId === locationId &&
            actor.alive &&
            !actor.tags.has('offline') &&
            containsPoint(
                {
                    x: bounds.x - 4,
                    y: bounds.y - 4,
                    width: bounds.width + 8,
                    height: bounds.height + 8,
                },
                actor.position
            )
        ) {
            return true
        }
    }
    return false
}

export function canPlantAt(
    navigation: NavigationService,
    bounds: WorldObjectBounds,
    actor: GameCharacter,
    nodes: readonly AdventureResourceNode[],
    characters: Iterable<GameCharacter>,
    replacing?: AdventureResourceNode
): boolean {
    const { width, height, tileWidth, tileHeight } = navigation.grid
    if (
        bounds.x < tileWidth * 4 ||
        bounds.y < tileHeight * 4 ||
        bounds.x + bounds.width > (width - 4) * tileWidth ||
        bounds.y + bounds.height > (height - 4) * tileHeight ||
        occupied(bounds, characters, actor.locationId)
    ) {
        return false
    }
    if (
        nodes.some(
            (node) =>
                node !== replacing &&
                node.locationId === actor.locationId &&
                node.matureBounds !== undefined &&
                overlaps(bounds, node.matureBounds)
        )
    ) {
        return false
    }
    const cells = navigation.cellsInBounds(bounds)
    const oldCells = new Set(
        replacing?.collisionBounds === undefined
            ? []
            : navigation.cellsInBounds(replacing.collisionBounds)
    )
    if (
        cells.some(
            (index) =>
                (replacing === undefined &&
                    navigation.grid.plantable?.[index] !== true) ||
                (navigation.grid.solid[index] === true && !oldCells.has(index))
        )
    ) {
        return false
    }
    const reserved = nodes
        .filter(
            (node) =>
                node.locationId === actor.locationId && node.phase === 'growing'
        )
        .flatMap((node) =>
            node.matureBounds === undefined
                ? []
                : navigation.cellsInBounds(node.matureBounds)
        )
    return preservesAccess(navigation, actor.position, cells, reserved)
}

/** Rare planting operation: reject a future trunk that splits existing walkable land. */
function preservesAccess(
    navigation: NavigationService,
    origin: Vector2,
    blocked: number[],
    reserved: number[]
): boolean {
    const start = navigation.worldToTile(origin)
    const first = start.y * navigation.grid.width + start.x
    const before = flood(navigation, first, new Set(reserved))
    const added = new Set([...reserved, ...blocked])
    if (added.has(first)) {
        return false
    }
    const after = flood(navigation, first, added)
    for (const cell of before) {
        if (!added.has(cell) && !after.has(cell)) {
            return false
        }
    }
    return true
}

function flood(
    navigation: NavigationService,
    start: number,
    added: Set<number>
): Set<number> {
    const { width, height, solid } = navigation.grid
    const seen = new Set<number>([start])
    const queue = [start]
    for (const cell of queue) {
        const x = cell % width,
            y = Math.floor(cell / width)
        for (const next of [
            x > 0 ? cell - 1 : -1,
            x + 1 < width ? cell + 1 : -1,
            y > 0 ? cell - width : -1,
            y + 1 < height ? cell + width : -1,
        ]) {
            if (
                next < 0 ||
                seen.has(next) ||
                solid[next] === true ||
                added.has(next)
            ) {
                continue
            }
            seen.add(next)
            queue.push(next)
        }
    }
    return seen
}

export function resourceReachable(
    actor: GameCharacter,
    bounds: WorldObjectBounds,
    navigation: NavigationService
): boolean {
    const { x, y, width, height } = bounds
    const horizontal = Math.max(x, Math.min(x + width, actor.position.x))
    const vertical = Math.max(y, Math.min(y + height, actor.position.y))
    return [
        { x: horizontal, y: y - 1 },
        { x: horizontal, y: y + height + 1 },
        { x: x - 1, y: vertical },
        { x: x + width + 1, y: vertical },
    ].some(
        (point) =>
            Math.hypot(
                actor.position.x - point.x,
                actor.position.y - point.y
            ) <= 48 && navigation.hasLineOfSight(actor.position, point)
    )
}
