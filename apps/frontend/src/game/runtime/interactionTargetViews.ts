import type { CharacterRelationship, Vector2, WorldObjectBounds } from '@my-game-ratata/contracts'
import { Actor, Canvas, type Engine, vec } from 'excalibur'

import { createWorldNameLabel } from './characterViewBundle'
import { contourShapeKey, interactionContour } from './interactionContour'

export interface TargetHighlight {
    key: string
    name?: string
    position: Vector2
    bounds?: WorldObjectBounds
    interactionAreas?: WorldObjectBounds[]
    kind?: 'character' | 'object'
    relationship?: CharacterRelationship
}

/** Presentation of the exact UI-selected target. This class never picks a target or alters its sprite. */
export class InteractionTargetViews {
    private readonly frame = new Actor({ anchor: vec(0, 0) })
    private readonly ground = new Actor({ anchor: vec(0.5, 0.5) })
    private readonly name = createWorldNameLabel()
    private shape = ''
    private disposed = false

    public constructor(engine: Engine) {
        this.name.graphics.anchor = vec(0.5, 1)
        this.clear()
        engine.add(this.ground)
        engine.add(this.frame)
        engine.add(this.name)
    }

    public set(target: TargetHighlight | undefined): void {
        if (this.disposed || !target) {
            this.clear()
            return
        }
        if (this.setCompound(target)) return
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
        const relationship = target.kind === 'character' ? target.relationship : undefined
        const shape = `${target.kind ?? 'object'}:${relationship ?? 'neutral'}:${String(width)}:${String(height)}`
        if (shape !== this.shape) {
            this.frame.graphics.use(cornerGraphic(width, height, relationship))
            this.ground.graphics.use(groundGraphic(Math.min(32, width + 4), relationship))
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
        this.placeName(target.name, bounds)
    }

    private setCompound(target: TargetHighlight): boolean {
        const { bounds, interactionAreas } = target
        if (!bounds || !interactionAreas?.length) return false
        const shape = contourShapeKey(bounds, interactionAreas)
        if (shape !== this.shape) {
            this.frame.graphics.use(interactionContour(bounds, interactionAreas))
            this.shape = shape
        }
        this.frame.pos = vec(bounds.x - 3, bounds.y - 3)
        this.frame.z = bounds.y + bounds.height + 3
        this.frame.graphics.isVisible = true
        this.ground.graphics.isVisible = false
        this.placeName(target.name, bounds)
        return true
    }

    private placeName(text: string | undefined, bounds: WorldObjectBounds): void {
        this.name.graphics.isVisible = Boolean(text)
        if (!text) return
        if (this.name.text !== text) this.name.text = text
        this.name.pos = vec(bounds.x + bounds.width / 2, bounds.y - 8)
        this.name.z = this.frame.z + 1
    }

    public clear(): void {
        this.frame.graphics.isVisible = this.ground.graphics.isVisible = false
        this.name.graphics.isVisible = false
    }

    public dispose(): void {
        if (this.disposed) return
        this.disposed = true
        this.clear()
        this.frame.kill()
        this.ground.kill()
        this.name.kill()
    }
}

function cornerGraphic(
    width: number,
    height: number,
    relationship?: CharacterRelationship
): Canvas {
    const color = highlightColor(relationship)
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
            context.strokeStyle = `${color}55`
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
            context.strokeStyle = color
            context.stroke()
            if (relationship) drawRelationship(context, width / 2 + 3, 6, relationship, color)
        },
    })
}

function groundGraphic(width: number, relationship?: CharacterRelationship): Canvas {
    const color = highlightColor(relationship)
    return new Canvas({
        width: width + 4,
        height: 12,
        cache: true,
        smoothing: false,
        draw: (context) => {
            context.beginPath()
            if (relationship === 'hostile') {
                context.moveTo(2, 6)
                context.lineTo((width + 4) / 2, 1)
                context.lineTo(width + 2, 6)
                context.lineTo((width + 4) / 2, 11)
                context.closePath()
            } else {
                context.ellipse((width + 4) / 2, 6, width / 2, 4, 0, 0, Math.PI * 2)
            }
            context.fillStyle = relationship === undefined ? '#ffd97922' : `${color}22`
            context.fill()
            context.strokeStyle = `${color}cc`
            context.lineWidth = 1
            context.stroke()
        },
    })
}

function highlightColor(relationship?: CharacterRelationship): string {
    return relationship === 'hostile' ? '#ff978b' : relationship ? '#9be6c0' : '#ffe295'
}

function drawRelationship(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    relationship: CharacterRelationship,
    color: string
): void {
    context.beginPath()
    context.arc(x, y, 5, 0, Math.PI * 2)
    context.fillStyle = '#18231fee'
    context.fill()
    context.beginPath()
    if (relationship === 'hostile') {
        // Two crossed blades retain their meaning without relying on red alone.
        context.moveTo(x - 3, y - 3)
        context.lineTo(x + 3, y + 3)
        context.moveTo(x + 3, y - 3)
        context.lineTo(x - 3, y + 3)
        context.moveTo(x - 4, y + 1)
        context.lineTo(x - 1, y + 4)
        context.moveTo(x + 1, y + 4)
        context.lineTo(x + 4, y + 1)
    } else {
        context.moveTo(x - 3, y - 3)
        context.lineTo(x + 3, y - 3)
        context.lineTo(x + 3, y + 1)
        context.lineTo(x, y + 4)
        context.lineTo(x - 3, y + 1)
        context.closePath()
    }
    context.strokeStyle = color
    context.lineWidth = 1
    context.stroke()
}
