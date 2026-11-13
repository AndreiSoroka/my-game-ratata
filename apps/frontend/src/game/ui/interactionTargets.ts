import type { CharacterSnapshot, Vector2, WorldObjectBounds } from '@my-game-ratata/contracts'

export function nearestByKind<T>(
    targets: readonly T[],
    kind: (target: T) => string,
    distance: (target: T) => number
): T[] {
    const nearest = new Map<string, T>()
    for (const target of targets) {
        const key = kind(target)
        const previous = nearest.get(key)
        if (previous === undefined || distance(target) < distance(previous))
            nearest.set(key, target)
    }
    return [...nearest.values()].sort((first, second) => distance(first) - distance(second))
}

export function distanceToBounds(position: Vector2, bounds: WorldObjectBounds): number {
    const x = Math.max(bounds.x, Math.min(position.x, bounds.x + bounds.width))
    const y = Math.max(bounds.y, Math.min(position.y, bounds.y + bounds.height))
    return Math.hypot(position.x - x, position.y - y)
}

export interface FacingInteractionTarget {
    key: string
    position: Vector2
    bounds?: WorldObjectBounds
}

/** Select one physical target in the forward 90-degree sector, never a list of neighbors. */
export function facingInteractionTarget<T extends FacingInteractionTarget>(
    targets: readonly T[],
    player: Pick<CharacterSnapshot, 'position' | 'facing'>,
    targetKey?: string,
    ignoreFacing = false
): T | undefined {
    const direction = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
    }[player.facing]
    return targets
        .filter((target) => targetKey === undefined || target.key === targetKey)
        .map((target) => {
            const reach = target.bounds
                ? distanceToBounds(player.position, target.bounds)
                : Math.hypot(
                      target.position.x - player.position.x,
                      target.position.y - player.position.y
                  )
            // Aim at the nearest surface ahead, including the accessible shore of large water objects.
            const aim = target.bounds
                ? {
                      x: Math.max(
                          target.bounds.x,
                          Math.min(
                              target.bounds.x + target.bounds.width,
                              player.position.x + direction.x * 48
                          )
                      ),
                      y: Math.max(
                          target.bounds.y,
                          Math.min(
                              target.bounds.y + target.bounds.height,
                              player.position.y + direction.y * 48
                          )
                      ),
                  }
                : target.position
            const dx = aim.x - player.position.x
            const dy = aim.y - player.position.y
            const forward = dx * direction.x + dy * direction.y
            const sideways = Math.abs(dx * direction.y - dy * direction.x)
            return {
                target,
                reach,
                sideways,
                visible: ignoreFacing || reach <= 4 || (forward > 0 && sideways <= forward + 1),
            }
        })
        .filter((candidate) => candidate.visible)
        .sort(
            (a, b) =>
                a.reach - b.reach ||
                a.sideways - b.sideways ||
                a.target.key.localeCompare(b.target.key)
        )[0]?.target
}

export function interactionDistance(
    first: { position: Vector2 },
    second: { position: Vector2 }
): number {
    return Math.hypot(first.position.x - second.position.x, first.position.y - second.position.y)
}
