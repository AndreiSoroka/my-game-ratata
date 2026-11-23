import type { Vector2, ViewportBounds, WorldObjectBounds } from '@my-game-ratata/contracts'

interface SpatialSnapshot {
    id: string
    position: Vector2
    bounds?: WorldObjectBounds
    collisionBounds?: WorldObjectBounds
    matureBounds?: WorldObjectBounds
}

/** Last observed presentation state, scoped to one loaded map. */
export class WorldInterestCache<T extends SpatialSnapshot> {
    private readonly known = new Map<string, T>()

    public update(nodes: readonly T[], bounds?: ViewportBounds) {
        const incoming = new Set(nodes.map((node) => node.id))
        const removed: T[] = []
        for (const [id, node] of this.known) {
            if (!incoming.has(id) && (bounds === undefined || intersects(node, bounds))) {
                this.known.delete(id)
                removed.push(node)
            }
        }
        for (const node of nodes) this.known.set(node.id, node)
        return { nodes: [...this.known.values()], removed }
    }

    public clear(): void {
        this.known.clear()
    }
}

/** The server already expanded these bounds; only account for the resource footprint. */
function intersects(node: SpatialSnapshot, bounds: ViewportBounds): boolean {
    const { x, y } = node.position
    const nearestX = Math.max(bounds.left, Math.min(x, bounds.right))
    const nearestY = Math.max(bounds.top, Math.min(y, bounds.bottom))
    return (
        Math.hypot(x - nearestX, y - nearestY) <= 32 ||
        [node.bounds, node.collisionBounds, node.matureBounds].some(
            (area) => area !== undefined && rectangleIntersects(area, bounds)
        )
    )
}

function rectangleIntersects(area: WorldObjectBounds, bounds: ViewportBounds): boolean {
    return (
        area.x <= bounds.right &&
        area.x + area.width >= bounds.left &&
        area.y <= bounds.bottom &&
        area.y + area.height >= bounds.top
    )
}
