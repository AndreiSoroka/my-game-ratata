import { interactionBoundary, type WorldObjectBounds } from '@my-game-ratata/contracts'
import { Canvas } from 'excalibur'

export function contourShapeKey(
    bounds: WorldObjectBounds,
    areas: readonly WorldObjectBounds[]
): string {
    return `contour:${JSON.stringify(areas.map((area) => [area.x - bounds.x, area.y - bounds.y, area.width, area.height]))}`
}

/** Draw only authored water and its exterior shoreline, never the bounding-box corners. */
export function interactionContour(
    bounds: WorldObjectBounds,
    areas: readonly WorldObjectBounds[]
): Canvas {
    const edges = interactionBoundary(areas)
    return new Canvas({
        width: Math.ceil(bounds.width) + 6,
        height: Math.ceil(bounds.height) + 6,
        cache: true,
        smoothing: false,
        draw: (context) => {
            context.fillStyle = '#ffd97916'
            for (const area of areas)
                context.fillRect(
                    area.x - bounds.x + 3,
                    area.y - bounds.y + 3,
                    area.width,
                    area.height
                )
            context.beginPath()
            for (const edge of edges) {
                context.moveTo(edge.from.x - bounds.x + 3, edge.from.y - bounds.y + 3)
                context.lineTo(edge.to.x - bounds.x + 3, edge.to.y - bounds.y + 3)
            }
            context.strokeStyle = '#26301ddd'
            context.lineWidth = 3
            context.stroke()
            context.strokeStyle = '#ffe295'
            context.lineWidth = 1
            context.stroke()
        },
    })
}
