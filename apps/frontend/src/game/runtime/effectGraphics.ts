import { type DeityId, PRAYER_RULES } from '@my-game-ratata/contracts'
import { Canvas } from 'excalibur'

import { drawPrayerGraphic, type PrayerShape } from './prayerGraphics'

export type EffectShape =
    PrayerShape | 'arrow' | 'spark' | 'fireball' | 'slash' | 'bone' | 'barrier' | 'shards'
export const SPARK_COLOR = '#8cbbff'
export const BARRIER_COLOR = '#96beed'
export const FIRE_COLOR = '#ffa75b'
export function effectSize(kind: EffectShape): number {
    return kind === 'wave' ? PRAYER_RULES.radius * 2 + 8 : 64
}
type Context = CanvasRenderingContext2D

function arrow(ctx: Context): void {
    ctx.fillStyle = '#caa76b'
    ctx.fillRect(-16, -1, 29, 2)
    ctx.fillStyle = '#dfe5e8'
    ctx.beginPath()
    ctx.moveTo(18, 0)
    ctx.lineTo(9, -4)
    ctx.lineTo(9, 4)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#acced0'
    ctx.fillRect(-16, -4, 5, 2)
    ctx.fillRect(-16, 2, 5, 2)
}
function spark(ctx: Context): void {
    ctx.fillStyle = SPARK_COLOR
    ctx.fillRect(-8, -2, 15, 4)
    ctx.fillRect(-2, -8, 4, 16)
    ctx.fillStyle = '#a98ae8'
    ctx.fillRect(-18, -1, 6, 2)
    ctx.fillStyle = '#eee5ff'
    ctx.fillRect(-3, -3, 6, 6)
    ctx.strokeStyle = '#a98ae8'
    ctx.beginPath()
    ctx.moveTo(-12, -6)
    ctx.lineTo(-7, -9)
    ctx.lineTo(-3, -5)
    ctx.stroke()
}
function fireball(ctx: Context): void {
    ctx.fillStyle = '#d56236'
    ctx.beginPath()
    ctx.moveTo(-23, -5)
    ctx.lineTo(-8, -2)
    ctx.lineTo(-15, -11)
    ctx.lineTo(6, -8)
    ctx.lineTo(11, 0)
    ctx.lineTo(6, 8)
    ctx.lineTo(-18, 9)
    ctx.lineTo(-9, 3)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = FIRE_COLOR
    ctx.fillRect(-6, -5, 12, 10)
    ctx.fillStyle = '#fff0ac'
    ctx.fillRect(-2, -2, 6, 4)
}
function barrier(ctx: Context): void {
    ctx.strokeStyle = BARRIER_COLOR
    ctx.fillStyle = '#709ce02a'
    ctx.beginPath()
    ctx.moveTo(0, -23)
    ctx.lineTo(18, -12)
    ctx.lineTo(18, 12)
    ctx.lineTo(0, 23)
    ctx.lineTo(-18, 12)
    ctx.lineTo(-18, -12)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.globalAlpha = 0.55
    for (const x of [-18, 18]) {
        ctx.beginPath()
        ctx.moveTo(0, -23)
        ctx.lineTo(x, 12)
        ctx.lineTo(-x, -12)
        ctx.lineTo(0, 23)
        ctx.stroke()
    }
}
function shards(ctx: Context): void {
    ctx.fillStyle = BARRIER_COLOR
    for (let i = 0; i < 6; i++) {
        ctx.save()
        ctx.rotate((i * Math.PI) / 3)
        ctx.beginPath()
        ctx.moveTo(-3, -16)
        ctx.lineTo(4, -24)
        ctx.lineTo(3, -13)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
    }
}
function slash(ctx: Context, bone = false): void {
    ctx.strokeStyle = bone ? '#e8dec7' : '#dfe5e8'
    ctx.lineWidth = bone ? 4 : 2
    ctx.beginPath()
    ctx.arc(-4, 3, 18, -1.4, 0.4)
    ctx.stroke()
    if (bone) {
        ctx.fillStyle = '#e8dec7'
        ctx.fillRect(3, -16, 4, 4)
        ctx.fillRect(13, 8, 4, 4)
    }
}
/** Shared by runtime cached Canvas and focused Storybook previews. */
export function drawEffectGraphic(
    ctx: Context,
    kind: EffectShape,
    deity: DeityId = 'hearth',
    phase = 1
): void {
    ctx.save()
    ctx.shadowColor = '#18221d'
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = 1
    ctx.shadowBlur = 0
    ctx.lineWidth = 2
    const renderers: Partial<Record<EffectShape, (ctx: Context) => void>> = {
        arrow,
        spark,
        fireball,
        barrier,
        shards,
        slash,
        bone: (context) => slash(context, true),
    }
    const render = renderers[kind]
    if (render) render(ctx)
    else drawPrayerGraphic(ctx, kind as PrayerShape, deity, phase)
    ctx.restore()
}
export class EffectGraphics {
    private readonly cache = new Map<string, Canvas>()
    public get(kind: EffectShape, deity: DeityId = 'hearth', phase = 1): Canvas {
        const step = kind === 'casting' ? Math.round(phase * 16) : 16
        const key = `${kind}:${deity}:${step}`
        const previous = this.cache.get(key)
        if (previous) return previous
        const size = effectSize(kind)
        const graphic = new Canvas({
            width: size,
            height: size,
            cache: true,
            smoothing: false,
            draw: (ctx) => {
                ctx.translate(size / 2, size / 2)
                drawEffectGraphic(ctx, kind, deity, step / 16)
            },
        })
        if (this.cache.size >= 96) this.cache.delete(this.cache.keys().next().value!)
        this.cache.set(key, graphic)
        return graphic
    }
    public clear(): void {
        this.cache.clear()
    }
}
