import { type DeityId, PRAYER_RULES } from '@my-game-ratata/contracts'

export const deityColors: Record<DeityId, string> = {
    hearth: '#f9d37b',
    road: '#9dd17d',
    lantern: '#8fb9fa',
    grave: '#be96df',
}
export type PrayerShape =
    'devotion' | 'restore' | 'wave' | 'prayer_hit' | 'revive' | 'casting' | 'refused'
type Context = CanvasRenderingContext2D

function star(ctx: Context, x: number, y: number, radius = 3): void {
    ctx.fillRect(x - radius, y - 1, radius * 2, 2)
    ctx.fillRect(x - 1, y - radius, 2, radius * 2)
}
function flame(ctx: Context, x: number, y: number, size: number): void {
    ctx.beginPath()
    ctx.moveTo(x, y - size)
    ctx.lineTo(x + size * 0.3, y - size * 0.2)
    ctx.lineTo(x + size * 0.65, y - size * 0.55)
    ctx.lineTo(x + size * 0.7, y + size * 0.35)
    ctx.lineTo(x, y + size * 0.7)
    ctx.lineTo(x - size * 0.65, y + size * 0.3)
    ctx.lineTo(x - size * 0.35, y - size * 0.6)
    ctx.lineTo(x - size * 0.2, y - size * 0.05)
    ctx.closePath()
    ctx.fill()
}
function hearth(ctx: Context, radius: number, wave: boolean): void {
    if (!wave) {
        flame(ctx, 0, 0, radius * 0.7)
        ctx.fillStyle = '#fff4c5'
        flame(ctx, 0, radius * 0.2, radius * 0.32)
        return
    }
    for (let i = 0; i < 8; i++) {
        ctx.save()
        ctx.rotate((i * Math.PI) / 4)
        flame(ctx, 0, -radius + 8, 8)
        ctx.restore()
    }
}
function road(ctx: Context, radius: number, wave: boolean): void {
    for (let i = 0; i < 3; i++) {
        const y = (i - 1) * radius * 0.42
        ctx.beginPath()
        ctx.moveTo(-radius * 0.8, y + 3)
        ctx.bezierCurveTo(-radius * 0.15, y - 9, radius * 0.5, y + 10, radius * 0.8, y - 4)
        ctx.stroke()
    }
    if (wave) {
        for (let i = 0; i < 4; i++) {
            ctx.beginPath()
            ctx.arc(0, 0, radius, (i * Math.PI) / 2, (i * Math.PI) / 2 + 0.8)
            ctx.stroke()
        }
    }
}
function lantern(ctx: Context, radius: number, wave: boolean): void {
    const points = wave ? 8 : 5
    ctx.beginPath()
    for (let i = 0; i < points; i++) {
        const angle = (i * Math.PI * 2) / points - Math.PI / 2
        const x = Math.cos(angle) * radius * (i % 2 ? 0.65 : 1)
        const y = Math.sin(angle) * radius * (i % 2 ? 0.65 : 1)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.stroke()
    for (let i = 0; i < points; i++) {
        const angle = (i * Math.PI * 2) / points - Math.PI / 2
        const r = radius * (i % 2 ? 0.65 : 1)
        star(ctx, Math.cos(angle) * r, Math.sin(angle) * r)
    }
    star(ctx, 0, 0, 4)
}
function grave(ctx: Context, radius: number, wave: boolean): void {
    for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3
        ctx.beginPath()
        ctx.arc(0, 0, radius, angle + 0.12, angle + 0.75)
        ctx.stroke()
        ctx.fillRect(Math.cos(angle) * (radius - 6) - 1, Math.sin(angle) * (radius - 6) - 1, 2, 3)
    }
    if (!wave) {
        ctx.beginPath()
        ctx.moveTo(-4, -7)
        ctx.lineTo(3, -2)
        ctx.lineTo(-2, 3)
        ctx.lineTo(4, 8)
        ctx.stroke()
    }
}
const emblems = { hearth, road, lantern, grave }

/** Drawn once per cached frame. Radii are world pixels, including the server's 48px wave. */
export function drawPrayerGraphic(
    ctx: Context,
    kind: PrayerShape,
    deity: DeityId,
    phase = 1
): void {
    const wave = kind === 'wave'
    ctx.strokeStyle = deityColors[deity]
    ctx.fillStyle = deityColors[deity]
    ctx.lineWidth = 2
    if (wave) {
        ctx.globalAlpha = 0.12
        ctx.beginPath()
        ctx.arc(0, 0, PRAYER_RULES.radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
    }
    emblems[deity](ctx, wave ? PRAYER_RULES.radius - 2 : 12, wave)
    if (kind === 'refused') drawRefusal(ctx)
    if (kind === 'casting') drawCastArc(ctx, phase)
    if (kind === 'revive') drawRevival(ctx)
    if (kind === 'restore') {
        ctx.globalAlpha = 0.55
        ctx.beginPath()
        ctx.ellipse(0, 19, 17, 5, 0, 0, Math.PI * 2)
        ctx.stroke()
    }
}
function drawCastArc(ctx: Context, phase: number): void {
    ctx.save()
    ctx.globalAlpha = 0.15
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(0, 0, 20, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * phase)
    ctx.stroke()
    const angle = -Math.PI / 2 + Math.PI * 2 * phase
    star(ctx, Math.cos(angle) * 20, Math.sin(angle) * 20, 2)
    ctx.restore()
}
function drawRevival(ctx: Context): void {
    for (const x of [-18, 18]) {
        ctx.beginPath()
        ctx.moveTo(x, 20)
        ctx.lineTo(x, -22)
        ctx.moveTo(x - 3, -17)
        ctx.lineTo(x, -22)
        ctx.lineTo(x + 3, -17)
        ctx.stroke()
    }
    ctx.beginPath()
    ctx.ellipse(0, 23, 23, 7, 0, 0, Math.PI * 2)
    ctx.stroke()
}

function drawRefusal(ctx: Context): void {
    ctx.strokeStyle = '#696c68'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-15, -15)
    ctx.lineTo(15, 15)
    ctx.moveTo(15, -15)
    ctx.lineTo(-15, 15)
    ctx.stroke()
}
