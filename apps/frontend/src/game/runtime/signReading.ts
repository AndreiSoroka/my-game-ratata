import type { CharacterSnapshot, Vector2, WorldObjectSnapshot } from '@my-game-ratata/contracts'

import { mapHasLineOfSight, type MapVisibility } from './mapVisibility'

export function nearestReadableSign(
    objects: WorldObjectSnapshot[],
    player: Pick<CharacterSnapshot, 'alive' | 'facing' | 'position' | 'tags'> | undefined,
    map: MapVisibility | undefined,
    isPositionVisible: (position: Vector2) => boolean
): WorldObjectSnapshot | undefined {
    if (!player?.alive || !map || player.tags.includes('offline')) return undefined
    return objects
        .filter(
            (object) =>
                object.kind === 'sign' &&
                (standsOnSign(player.position, object) || facesSign(player, object.position)) &&
                isPositionVisible(object.position) &&
                readableFrom(object, player.position, map)
        )
        .sort(
            (first, second) =>
                distance(first.position, player.position) -
                distance(second.position, player.position)
        )[0]
}

function standsOnSign(player: Vector2, sign: WorldObjectSnapshot): boolean {
    const { x, y, width, height } = sign.bounds
    const nearest = {
        x: Math.max(x, Math.min(x + width, player.x)),
        y: Math.max(y, Math.min(y + height, player.y)),
    }
    // Include the character's feet at the edge of the physical sign, without extending reading reach.
    return distance(player, nearest) <= 4
}

function facesSign(player: Pick<CharacterSnapshot, 'facing' | 'position'>, sign: Vector2): boolean {
    const delta = { x: sign.x - player.position.x, y: sign.y - player.position.y }
    const direction = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
    }[player.facing]
    const forward = delta.x * direction.x + delta.y * direction.y
    const sideways = Math.abs(delta.x * direction.y - delta.y * direction.x)
    // A 90-degree front sector, with one pixel of tolerance at its diagonal edges.
    // Nearly overlapping centers have no reliable direction; do not flicker on tiny position jitter.
    return forward > 2 && sideways <= forward + 1
}

function readableFrom(sign: WorldObjectSnapshot, player: Vector2, map: MapVisibility): boolean {
    const { x, y, width, height } = sign.bounds
    const horizontal = Math.max(x, Math.min(x + width, player.x))
    const vertical = Math.max(y, Math.min(y + height, player.y))
    // Match the server's exterior reach check: the physical sign itself can occupy a solid cell.
    const edges = [
        { x: horizontal, y: y - 1 },
        { x: horizontal, y: y + height + 1 },
        { x: x - 1, y: vertical },
        { x: x + width + 1, y: vertical },
    ]
    return edges.some(
        (edge) => distance(player, edge) <= 48 && mapHasLineOfSight(map, player, edge)
    )
}

function distance(first: Vector2, second: Vector2): number {
    return Math.hypot(first.x - second.x, first.y - second.y)
}
