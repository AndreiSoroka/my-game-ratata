import type { Vector2 } from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import type { ProjectileFlight } from './magicProjectiles'

export function clearFlightDistance(
    projectile: ProjectileFlight,
    length: number,
    navigation: AbilityContext['navigation']
): number {
    const samples = Math.ceil(
        length /
            Math.min(
                2,
                navigation.grid.tileWidth / 4,
                navigation.grid.tileHeight / 4
            )
    )
    for (let index = 1; index <= samples; index += 1) {
        const sample = (index * length) / samples
        const position = positionAlong(projectile, sample)
        if (navigation.isSolidTile(navigation.worldToTile(position))) {
            return ((index - 1) * length) / samples
        }
    }
    return length
}

export function firstContactDistance(
    projectile: ProjectileFlight,
    length: number,
    context: AbilityContext
): { distance: number; target: GameCharacter } | undefined {
    const { actor, position, direction, locationId } = projectile
    const hitRadius = context.navigation.grid.tileWidth / 3
    let first: { distance: number; target: GameCharacter } | undefined
    if (projectile.range === 0) {
        return undefined
    }
    for (const target of context.characters) {
        if (target === actor || !availableTarget(target, locationId)) {
            continue
        }
        const x = target.position.x - position.x
        const y = target.position.y - position.y
        const projection = x * direction.x + y * direction.y
        const radial =
            hitRadius * hitRadius - (x * x + y * y - projection * projection)
        if (radial < 0 || projection + Math.sqrt(radial) < 0) {
            continue
        }
        const contact = Math.max(0, projection - Math.sqrt(radial))
        if (
            contact <= length &&
            (first === undefined || contact < first.distance) &&
            context.navigation.hasLineOfSight(
                positionAlong(projectile, contact),
                target.position
            )
        ) {
            first = { distance: contact, target }
        }
    }
    return first
}

export function positionAlong(
    { position, direction }: ProjectileFlight,
    length: number
): Vector2 {
    return {
        x: position.x + direction.x * length,
        y: position.y + direction.y * length,
    }
}

export function availableTarget(
    target: GameCharacter,
    locationId: string
): boolean {
    return (
        target.locationId === locationId &&
        target.alive &&
        !target.tags.has('state.retired') &&
        !target.tags.has('offline')
    )
}
