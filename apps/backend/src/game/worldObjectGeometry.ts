import type {
    WorldObjectBounds,
    WorldObjectKind,
} from '@my-game-ratata/contracts'

export function readInteractionAreas(
    value: unknown,
    bounds: WorldObjectBounds,
    kind: WorldObjectKind
): WorldObjectBounds[] | undefined {
    if (value === undefined) {
        return undefined
    }
    if (typeof value !== 'string' || kind !== 'water') {
        throw new Error('Invalid interaction geometry')
    }
    const areas: unknown = JSON.parse(value)
    if (
        !Array.isArray(areas) ||
        areas.length === 0 ||
        areas.length > 64 ||
        !areas.every(isArea)
    ) {
        throw new Error('Invalid interaction areas')
    }
    if (
        areas.some((area) => !inside(area, bounds)) ||
        areas.reduce((sum, area) => sum + area.width * area.height, 0) >
            64 * 16 * 16
    ) {
        throw new Error('Pond interaction exceeds its authored footprint')
    }
    return areas.map(({ x, y, width, height }) => ({ x, y, width, height }))
}

function isArea(value: unknown): value is WorldObjectBounds {
    if (value === null || typeof value !== 'object') {
        return false
    }
    const area = value as Partial<WorldObjectBounds>
    return (
        [area.x, area.y, area.width, area.height].every(
            (number) => typeof number === 'number' && Number.isFinite(number)
        ) &&
        typeof area.width === 'number' &&
        area.width > 0 &&
        typeof area.height === 'number' &&
        area.height > 0
    )
}

function inside(area: WorldObjectBounds, bounds: WorldObjectBounds): boolean {
    return (
        area.x >= bounds.x &&
        area.y >= bounds.y &&
        area.x + area.width <= bounds.x + bounds.width &&
        area.y + area.height <= bounds.y + bounds.height
    )
}
