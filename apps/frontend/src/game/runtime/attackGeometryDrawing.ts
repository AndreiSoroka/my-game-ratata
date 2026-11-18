import type { AttackGeometry } from '@my-game-ratata/contracts'

/** Draw only a server-authored contact footprint. This function never selects or damages a target. */
export function drawAttackGeometry(ctx: CanvasRenderingContext2D, geometry: AttackGeometry): void {
    ctx.beginPath()
    if (geometry.kind === 'rectangles') {
        for (const zone of geometry.zones)
            ctx.rect(zone.minX, zone.minY, zone.maxX - zone.minX, zone.maxY - zone.minY)
    } else if (geometry.kind === 'circle') {
        ctx.arc(geometry.center.x, geometry.center.y, geometry.radius, 0, Math.PI * 2)
    } else {
        const direction = Math.atan2(geometry.direction.y, geometry.direction.x)
        const half = (geometry.angleDegrees * Math.PI) / 360
        ctx.moveTo(geometry.center.x, geometry.center.y)
        ctx.arc(
            geometry.center.x,
            geometry.center.y,
            geometry.radius,
            direction - half,
            direction + half
        )
        ctx.closePath()
    }
    ctx.fill()
}
