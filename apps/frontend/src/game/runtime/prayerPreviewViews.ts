import { Actor, Canvas, type Engine, vec } from 'excalibur'

import type { PrayerPreviewHighlight } from './prayerPreviewPresentation'

/** Static scene-owned geometry: no timers, particles, targeting or game mutations. */
export class PrayerPreviewViews {
    private readonly ring = new Actor({ anchor: vec(0.5, 0.5) })
    private readonly warnings = new Map<string, { actor: Actor; self: boolean }>()
    private radius = 0
    private disposed = false

    public constructor(private readonly engine: Engine) {
        this.ring.graphics.isVisible = false
        engine.add(this.ring)
    }

    public set(preview: PrayerPreviewHighlight | undefined): void {
        if (this.disposed || !preview) {
            this.clear()
            return
        }
        if (preview.radius !== this.radius) {
            this.ring.graphics.use(radiusGraphic(preview.radius))
            this.radius = preview.radius
        }
        this.ring.pos = vec(preview.origin.x, preview.origin.y)
        this.ring.z = preview.origin.y - 2
        this.ring.graphics.isVisible = true
        const ids = new Set(preview.warnings.map((warning) => warning.id))
        for (const [id, marker] of this.warnings) {
            if (!ids.has(id)) {
                marker.actor.kill()
                this.warnings.delete(id)
            }
        }
        for (const warning of preview.warnings) this.updateWarning(warning)
    }

    public clear(): void {
        this.ring.graphics.isVisible = false
        for (const marker of this.warnings.values()) marker.actor.kill()
        this.warnings.clear()
    }

    public dispose(): void {
        if (this.disposed) return
        this.disposed = true
        this.clear()
        this.ring.kill()
    }

    private updateWarning(warning: PrayerPreviewHighlight['warnings'][number]): void {
        let marker = this.warnings.get(warning.id)
        if (!marker) {
            const actor = new Actor({ anchor: vec(0.5, 1) })
            actor.graphics.use(warningGraphic(warning.self))
            marker = { actor, self: warning.self }
            this.warnings.set(warning.id, marker)
            this.engine.add(actor)
        } else if (marker.self !== warning.self) {
            marker.actor.graphics.use(warningGraphic(warning.self))
            marker.self = warning.self
        }
        marker.actor.pos = vec(warning.position.x, warning.position.y - 34)
        marker.actor.z = warning.position.y + 6
    }
}

function radiusGraphic(radius: number): Canvas {
    const center = radius + 2
    return new Canvas({
        width: center * 2,
        height: center * 2,
        cache: true,
        smoothing: false,
        draw: (context) => {
            context.beginPath()
            context.arc(center, center, radius, 0, Math.PI * 2)
            context.fillStyle = '#ffc36b15'
            context.fill()
            context.setLineDash([4, 3])
            context.strokeStyle = '#ffc36bdd'
            context.lineWidth = 1
            context.stroke()
            context.setLineDash([])
        },
    })
}

function warningGraphic(self: boolean): Canvas {
    return new Canvas({
        width: 13,
        height: 14,
        cache: true,
        smoothing: false,
        draw: (context) => {
            context.beginPath()
            context.moveTo(6.5, 1)
            context.lineTo(12, 12)
            context.lineTo(1, 12)
            context.closePath()
            context.fillStyle = '#261b16ee'
            context.fill()
            context.strokeStyle = self ? '#ff978b' : '#ffd484'
            context.lineWidth = 1
            context.stroke()
            context.fillStyle = context.strokeStyle
            context.fillRect(6, 5, 1, 3)
            context.fillRect(6, 10, 1, 1)
        },
    })
}
