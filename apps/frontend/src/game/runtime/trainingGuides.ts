import {
    type AttackZone,
    type CharacterSnapshot,
    type ProjectilePath,
    SHOT_HALF_WIDTH,
    snapshotPrayerParameters,
    type TrainingAreaDefinition,
    type Vector2,
} from '@my-game-ratata/contracts'
import { Actor, Canvas, type Engine, vec } from 'excalibur'

import { preferredPrayer } from '../ui/prayerSelection'
import type { PrayerPreviewHighlight } from './prayerPreviewPresentation'

export function insideTrainingArea(area: TrainingAreaDefinition, position: Vector2): boolean {
    const b = area.bounds
    return (
        position.x >= b.x &&
        position.y >= b.y &&
        position.x < b.x + b.width &&
        position.y < b.y + b.height
    )
}

export function observerTrainingArea(
    areas: readonly TrainingAreaDefinition[],
    observer: CharacterSnapshot | undefined
): TrainingAreaDefinition | undefined {
    if (
        !observer?.alive ||
        (observer.connected !== true && observer.soul?.controlSource !== 'model') ||
        observer.tags.includes('offline')
    )
        return undefined
    return areas.find((area) => insideTrainingArea(area, observer.position))
}

/** One scene-owned canvas clips every geometric hint to the authored inner rectangle. */
export class TrainingGuides {
    private readonly actor = new Actor({ anchor: vec(0, 0), z: 500 })
    private area: TrainingAreaDefinition | undefined
    private zones: AttackZone[] = []
    private shot: ProjectilePath | undefined
    private prayer: PrayerPreviewHighlight | undefined
    private learnedPrayer: PrayerPreviewHighlight | undefined

    public constructor(private readonly engine: Engine) {
        this.actor.graphics.isVisible = false
        engine.add(this.actor)
    }
    public update(
        area: TrainingAreaDefinition | undefined,
        characters: CharacterSnapshot[],
        visible: (id: string) => boolean,
        observer?: CharacterSnapshot
    ): void {
        if (!area) {
            this.clear()
            return
        }
        if (this.area?.id !== area.id) {
            const bounds = area.bounds
            this.actor.pos = vec(bounds.x, bounds.y)
            this.actor.graphics.use(
                new Canvas({
                    width: bounds.width,
                    height: bounds.height,
                    cache: false,
                    smoothing: false,
                    draw: (ctx) => this.draw(ctx),
                })
            )
        }
        this.area = area
        this.learnedPrayer = trainingPrayerHighlight(observer)
        if (this.engine.canvas) this.engine.canvas.dataset.trainingGuides = area.id
        if (this.engine.canvas) {
            if (this.learnedPrayer)
                this.engine.canvas.dataset.trainingPrayerRadius = String(this.learnedPrayer.radius)
            else delete this.engine.canvas.dataset.trainingPrayerRadius
        }
        this.zones = characters
            .filter((c) => c.alive && insideTrainingArea(area, c.position) && visible(c.id))
            .flatMap((c) => c.attackZones)
        this.actor.graphics.isVisible = true
    }
    public setShot(path: ProjectilePath | undefined): void {
        this.shot = this.area ? path : undefined
    }
    public setPrayer(preview: PrayerPreviewHighlight | undefined): void {
        this.prayer = this.area ? preview : undefined
    }
    public clear(): void {
        this.area = undefined
        this.zones = []
        this.shot = undefined
        this.prayer = undefined
        this.learnedPrayer = undefined
        this.actor.graphics.isVisible = false
        if (this.engine.canvas) delete this.engine.canvas.dataset.trainingGuides
        if (this.engine.canvas) delete this.engine.canvas.dataset.trainingPrayerRadius
    }
    public dispose(): void {
        this.clear()
        this.actor.kill()
    }
    private draw(ctx: CanvasRenderingContext2D): void {
        const area = this.area
        if (!area) return
        const b = area.bounds
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, b.width, b.height)
        ctx.clip()
        ctx.translate(-b.x, -b.y)
        ctx.fillStyle = '#ffcf5a59'
        for (const z of this.zones) ctx.fillRect(z.minX, z.minY, z.maxX - z.minX, z.maxY - z.minY)
        if (this.shot) this.drawShot(ctx, this.shot)
        const prayer = this.learnedPrayer
            ? {
                  ...this.learnedPrayer,
                  warnings:
                      this.prayer && this.prayer.abilityId === this.learnedPrayer.abilityId
                          ? this.prayer.warnings
                          : [],
              }
            : this.prayer
        if (prayer) this.drawPrayer(ctx, prayer)
        ctx.restore()
    }
    private drawShot(ctx: CanvasRenderingContext2D, path: ProjectilePath): void {
        const dx = path.endpoint.x - path.origin.x,
            dy = path.endpoint.y - path.origin.y
        const range = Math.hypot(dx, dy)
        if (!Number.isFinite(range) || range <= 0) return
        ctx.save()
        ctx.translate(path.origin.x, path.origin.y)
        ctx.rotate(Math.atan2(dy, dx))
        const width = path.halfWidth ?? SHOT_HALF_WIDTH
        ctx.strokeStyle = '#f4e2aacc'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 3])
        ctx.strokeRect(0, -width, range, width * 2)
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(range, 0)
        ctx.lineTo(range - 6, -4)
        ctx.moveTo(range, 0)
        ctx.lineTo(range - 6, 4)
        ctx.stroke()
        ctx.restore()
    }
    private drawPrayer(ctx: CanvasRenderingContext2D, preview: PrayerPreviewHighlight): void {
        ctx.beginPath()
        ctx.arc(preview.origin.x, preview.origin.y, preview.radius, 0, Math.PI * 2)
        ctx.fillStyle = '#ffc36b15'
        ctx.fill()
        ctx.strokeStyle = '#ffc36bdd'
        ctx.setLineDash([4, 3])
        ctx.stroke()
        ctx.setLineDash([])
        for (const warning of preview.warnings) {
            const { x, y } = warning.position
            ctx.beginPath()
            ctx.moveTo(x, y - 47)
            ctx.lineTo(x + 6, y - 35)
            ctx.lineTo(x - 6, y - 35)
            ctx.closePath()
            ctx.fillStyle = '#261b16ee'
            ctx.fill()
            ctx.strokeStyle = warning.self ? '#ff978b' : '#ffd484'
            ctx.stroke()
            ctx.fillStyle = ctx.strokeStyle
            ctx.fillRect(x, y - 43, 1, 3)
            ctx.fillRect(x, y - 38, 1, 1)
        }
    }
}

export function trainingPrayerHighlight(
    observer: CharacterSnapshot | undefined
): PrayerPreviewHighlight | undefined {
    if (!observer?.alive) return undefined
    const abilityId = preferredPrayer(observer)
    return abilityId
        ? {
              abilityId,
              origin: { ...observer.position },
              radius: snapshotPrayerParameters(observer, abilityId).radius,
              warnings: [],
          }
        : undefined
}
