import type { Vector2, WorldObjectBounds } from '@my-game-ratata/contracts'

interface SelectionFootprint {
    kind: string
    position: Vector2
    bounds?: WorldObjectBounds
    interactionAreas?: WorldObjectBounds[]
}
interface ViewportBounds {
    left: number
    top: number
    right: number
    bottom: number
}

/** Use the rendered footprint, so a partially visible actor remains selectable. */
export function selectionIntersectsViewport(
    target: SelectionFootprint,
    viewport: ViewportBounds
): boolean {
    const areas = target.interactionAreas?.length
        ? target.interactionAreas
        : [
              target.bounds ??
                  (target.kind === 'character'
                      ? {
                            x: target.position.x - 12,
                            y: target.position.y - 29,
                            width: 24,
                            height: 32,
                        }
                      : {
                            x: target.position.x - 8,
                            y: target.position.y - 8,
                            width: 16,
                            height: 16,
                        }),
          ]
    return areas.some(
        (area) =>
            area.x < viewport.right &&
            area.x + area.width > viewport.left &&
            area.y < viewport.bottom &&
            area.y + area.height > viewport.top
    )
}
