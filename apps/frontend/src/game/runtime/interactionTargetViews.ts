import type { Vector2, WorldObjectBounds } from '@my-game-ratata/contracts'
import { Actor, Canvas, type Engine, vec } from 'excalibur'

export interface TargetHighlight {
    key: string
    position: Vector2
    bounds?: WorldObjectBounds
    kind?: 'character' | 'object'
}

/** Presentation of the exact UI-selected target. This class never picks a target or alters its sprite. */
export class InteractionTargetViews {
    private readonly frame = new Actor({ anchor: vec(0, 0) })
    private readonly ground = new Actor({ anchor: vec(0.5, 0.5) })
    private shape = ''
    private disposed = false

    public constructor(engine: Engine) {
        this.clear()
        engine.add(this.ground)
        engine.add(this.frame)
    }

    public set(target: TargetHighlight | undefined): void {
        if (this.disposed || !target) {
            this.clear()
            return
        }
        const bounds =
            target.kind === 'character'
                ? { x: target.position.x - 12, y: target.position.y - 29, width: 24, height: 32 }
                : (target.bounds ?? {
                      x: target.position.x - 8,
                      y: target.position.y - 8,
                      width: 16,
                      height: 16,
                  })
        const width = Math.ceil(bounds.width),
            height = Math.ceil(bounds.height)
        const shape = `${target.kind ?? 'object'}:${String(width)}:${String(height)}`
        if (shape !== this.shape) {
            this.frame.graphics.use(cornerGraphic(width, height))
            this.ground.graphics.use(groundGraphic(Math.min(32, width + 4)))
            this.shape = shape
        }
        this.frame.pos = vec(bounds.x - 3, bounds.y - 3)
        this.frame.z = target.position.y + 3
        this.ground.pos = vec(
            target.position.x,
            target.position.y + (target.kind === 'character' ? 1 : height / 2 - 1)
        )
        this.ground.z = target.position.y - 1
        this.frame.graphics.isVisible = this.ground.graphics.isVisible = true
    }

    public clear(): void {
        this.frame.graphics.isVisible = this.ground.graphics.isVisible = false
    }

    public dispose(): void {
        if (this.disposed) return
        this.disposed = true
        this.clear()
        this.frame.kill()
        this.ground.kill()
    }
}

function cornerGraphic(width: number, height: number): Canvas {
    return new Canvas({
        width: width + 6,
        height: height + 6,
        cache: true,
        smoothing: false,
        draw: (context) => {
            const left = 2.5,
                top = 2.5,
                right = width + 3.5,
                bottom = height + 3.5
            const arm = Math.min(5, width / 3, height / 3)
            context.strokeStyle = '#ffd97955'
            context.lineWidth = 1
            context.strokeRect(left, top, right - left, bottom - top)
            context.beginPath()
            for (const [x, y, dx, dy] of [
                [left, top, 1, 1],
                [right, top, -1, 1],
                [left, bottom, 1, -1],
                [right, bottom, -1, -1],
            ] as const) {
                context.moveTo(x + dx * arm, y)
                context.lineTo(x, y)
                context.lineTo(x, y + dy * arm)
            }
            context.lineWidth = 3
            context.strokeStyle = '#26301ddd'
            context.stroke()
            context.lineWidth = 1
            context.strokeStyle = '#ffe295'
            context.stroke()
        },
    })
}

function groundGraphic(width: number): Canvas {
    return new Canvas({
        width: width + 4,
        height: 12,
        cache: true,
        smoothing: false,
        draw: (context) => {
            context.beginPath()
            context.ellipse((width + 4) / 2, 6, width / 2, 4, 0, 0, Math.PI * 2)
            context.fillStyle = '#ffd97922'
            context.fill()
            context.strokeStyle = '#ffe295cc'
            context.lineWidth = 1
            context.stroke()
        },
    })
}
