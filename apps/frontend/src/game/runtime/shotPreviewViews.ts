import { type ProjectilePath, SHOT_HALF_WIDTH } from '@my-game-ratata/contracts'
import { Actor, Canvas, type Engine, vec } from 'excalibur'

/** A single scene-owned aim guide; only server events can resolve a hit. */
export class ShotPreviewViews {
    private readonly guide = new Actor({ anchor: vec(0, 0.5) })
    private readonly graphics = new Map<string, Canvas>()
    private graphicKey = ''
    public constructor(engine: Engine) {
        this.clear()
        engine.add(this.guide)
    }
    public set(path: ProjectilePath | undefined): void {
        if (!path) {
            this.clear()
            return
        }
        const range =
            Math.round(
                Math.hypot(path.endpoint.x - path.origin.x, path.endpoint.y - path.origin.y) * 1000
            ) / 1000
        const width = path.halfWidth ?? SHOT_HALF_WIDTH
        if (!Number.isFinite(range) || range <= 0 || !Number.isFinite(width) || width <= 0) {
            this.clear()
            return
        }
        const key = `${range}:${width}`
        if (this.graphicKey !== key) {
            let graphic = this.graphics.get(key)
            if (!graphic) {
                graphic = aimGraphic(range, width)
                this.graphics.set(key, graphic)
            }
            this.guide.graphics.use(graphic)
            this.graphicKey = key
        }
        this.guide.pos = vec(path.origin.x, path.origin.y)
        this.guide.rotation = Math.atan2(
            path.endpoint.y - path.origin.y,
            path.endpoint.x - path.origin.x
        )
        this.guide.z = path.origin.y - 1
        this.guide.graphics.isVisible = true
    }
    public clear(): void {
        this.guide.graphics.isVisible = false
    }
    public dispose(): void {
        this.graphics.clear()
        this.guide.kill()
    }
}

function aimGraphic(range: number, width: number): Canvas {
    return new Canvas({
        width: range + 3,
        height: width * 2 + 4,
        cache: true,
        draw: (context) => {
            const y = width + 2
            context.strokeStyle = '#f4e2aacc'
            context.lineWidth = 1
            context.setLineDash([3, 3])
            context.strokeRect(1, 2, range, width * 2)
            context.setLineDash([])
            context.beginPath()
            context.moveTo(1, y)
            context.lineTo(range, y)
            context.lineTo(range - 6, y - 4)
            context.moveTo(range, y)
            context.lineTo(range - 6, y + 4)
            context.stroke()
        },
    })
}
