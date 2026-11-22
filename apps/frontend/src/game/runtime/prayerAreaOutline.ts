import { PRAYER_RULES } from '@my-game-ratata/contracts'

/** A quiet outline marks the exact circular extent around the inset painted glyphs. */
export function drawPrayerAreaOutline(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number
): void {
    const scale = radius / PRAYER_RULES.radius
    context.save()
    context.beginPath()
    context.arc(x, y, radius, 0, 2 * Math.PI)
    context.strokeStyle = '#251b2780'
    context.lineWidth = 1.8 * scale
    context.stroke()
    context.strokeStyle = '#fff0c891'
    context.lineWidth = 0.8 * scale
    context.stroke()
    context.restore()
}
