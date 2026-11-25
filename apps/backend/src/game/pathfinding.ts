import type { MapGrid, TileCoordinate } from './navigation'

interface PathNode extends TileCoordinate {
    f: number
    g: number
    parent?: PathNode
}

const neighbors = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
] as const

function heuristic(start: TileCoordinate, end: TileCoordinate): number {
    return Math.abs(end.x - start.x) + Math.abs(end.y - start.y)
}

function tileKey(tile: TileCoordinate): string {
    return `${String(tile.x)},${String(tile.y)}`
}

function isBlocked(grid: MapGrid, tile: TileCoordinate): boolean {
    if (tile.x < 0 || tile.y < 0) {
        return true
    }

    if (tile.x >= grid.width || tile.y >= grid.height) {
        return true
    }

    return grid.solid[tile.y * grid.width + tile.x] === true
}

function unwindPath(node: PathNode): TileCoordinate[] {
    const path: TileCoordinate[] = []
    let current: PathNode | undefined = node

    while (current !== undefined) {
        path.push({ x: current.x, y: current.y })
        current = current.parent
    }

    return path.reverse()
}

export function findPath(
    grid: MapGrid,
    start: TileCoordinate,
    end: TileCoordinate,
    canVisit?: (tile: TileCoordinate) => boolean
): TileCoordinate[] {
    const blocked = (tile: TileCoordinate) =>
        isBlocked(grid, tile) || canVisit?.(tile) === false
    if (blocked(end)) {
        return []
    }

    const open: PathNode[] = []
    const openMap = new Map<string, PathNode>()
    const closed = new Set<string>()
    const startNode: PathNode = {
        ...start,
        f: heuristic(start, end),
        g: 0,
    }

    open.push(startNode)
    openMap.set(tileKey(start), startNode)

    while (open.length > 0) {
        open.sort((a, b) => a.f - b.f)
        const current = open.shift()

        if (current === undefined) {
            break
        }

        openMap.delete(tileKey(current))

        if (current.x === end.x && current.y === end.y) {
            return unwindPath(current)
        }

        closed.add(tileKey(current))
        visitNeighbors(blocked, end, current, open, openMap, closed)
    }

    return []
}

function visitNeighbors(
    blocked: (tile: TileCoordinate) => boolean,
    end: TileCoordinate,
    current: PathNode,
    open: PathNode[],
    openMap: Map<string, PathNode>,
    closed: Set<string>
): void {
    for (const offset of neighbors) {
        const next = { x: current.x + offset.x, y: current.y + offset.y }
        const key = tileKey(next)

        if (closed.has(key) || blocked(next)) {
            continue
        }

        queueNeighbor(end, current, next, open, openMap)
    }
}

function queueNeighbor(
    end: TileCoordinate,
    current: PathNode,
    next: TileCoordinate,
    open: PathNode[],
    openMap: Map<string, PathNode>
): void {
    const key = tileKey(next)
    const tentativeG = current.g + 1
    const existing = openMap.get(key)

    if (existing !== undefined && tentativeG >= existing.g) {
        return
    }

    const nextNode: PathNode = {
        ...next,
        f: tentativeG + heuristic(next, end),
        g: tentativeG,
        parent: current,
    }
    openMap.set(key, nextNode)

    if (existing === undefined) {
        open.push(nextNode)
        return
    }

    const index = open.indexOf(existing)

    if (index >= 0) {
        open[index] = nextNode
    }
}
