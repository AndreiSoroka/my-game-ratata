import type { Vector2 } from '@my-game-ratata/contracts'

import type { TiledLandmark } from './mapLandmarks'

export interface MapBuilding {
    id: string
    name: string
    x: number
    y: number
    width: number
    height: number
    entry: Vector2
    cover: HTMLCanvasElement
}

export function readMapBuildings(
    objects: TiledLandmark[],
    covers: HTMLCanvasElement
): MapBuilding[] {
    return objects.filter(isBuilding).map((object) => {
        const width = Math.round(object.width)
        const height = Math.round(object.height)
        const cover = document.createElement('canvas')
        cover.width = width
        cover.height = height
        cover
            .getContext('2d')
            ?.drawImage(covers, object.x, object.y, width, height, 0, 0, width, height)
        return {
            id: String(object.id ?? object.name),
            name: object.name,
            x: object.x,
            y: object.y,
            width,
            height,
            cover,
            entry: {
                x: numberProperty(object, 'entryX', object.x + width / 2),
                y: numberProperty(object, 'entryY', object.y + height),
            },
        }
    })
}

export function containsPosition(
    building: Pick<MapBuilding, 'x' | 'y' | 'width' | 'height'>,
    position: Vector2
): boolean {
    return (
        position.x >= building.x &&
        position.x < building.x + building.width &&
        position.y >= building.y &&
        position.y < building.y + building.height
    )
}

function isBuilding(
    object: TiledLandmark
): object is TiledLandmark & { width: number; height: number } {
    return (
        object.type === 'building' &&
        typeof object.width === 'number' &&
        object.width > 0 &&
        typeof object.height === 'number' &&
        object.height > 0 &&
        Number.isFinite(object.x) &&
        Number.isFinite(object.y)
    )
}
function numberProperty(object: TiledLandmark, name: string, fallback: number): number {
    const value = object.properties?.find((property) => property.name === name)?.value
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
