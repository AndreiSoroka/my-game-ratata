import type { WorldGraveSnapshot } from '@my-game-ratata/contracts'
import { Actor, Canvas, CollisionType, type Engine, type PreUpdateEvent, vec } from 'excalibur'

/** Snapshot-owned grave phases never change collision or the independent corpse container. */
export class GraveViews {
    private actors = new Map<string, { actor: Actor; phase: WorldGraveSnapshot['phase'] }>()
    private hiddenProps = new Set<Actor>()
    private rings = new Map<
        string,
        { actor: Actor; completed: number; displayed: number; required: number }
    >()

    public constructor(private readonly engine: Engine) {}

    public update(
        graves: readonly WorldGraveSnapshot[],
        originals: ReadonlyMap<string, Actor>,
        bitmap?: HTMLCanvasElement
    ): void {
        for (const actor of this.hiddenProps) actor.graphics.isVisible = true
        this.hiddenProps.clear()
        this.updateRings(graves)
        const visible = new Set<string>()
        for (const grave of graves) {
            const original = grave.propId ? originals.get(grave.propId) : undefined
            if (original && grave.phase !== 'active') {
                original.graphics.isVisible = false
                this.hiddenProps.add(original)
            }
            if (grave.phase === 'purified' || (grave.phase === 'active' && original)) continue
            if (!bitmap) continue
            visible.add(grave.id)
            this.sync(grave, bitmap)
        }
        for (const [id, { actor }] of this.actors) {
            if (visible.has(id)) continue
            actor.kill()
            this.actors.delete(id)
        }
    }

    public dispose(): void {
        for (const { actor } of this.actors.values()) actor.kill()
        for (const actor of this.hiddenProps) actor.graphics.isVisible = true
        this.actors.clear()
        this.hiddenProps.clear()
        for (const { actor } of this.rings.values()) actor.kill()
        this.rings.clear()
    }

    private updateRings(graves: readonly WorldGraveSnapshot[]): void {
        const visible = new Set<string>()
        for (const grave of graves) {
            const progress = grave.purification
            if (!progress || grave.phase === 'purified') continue
            visible.add(grave.id)
            let ring = this.rings.get(grave.id)
            if (!ring) {
                const actor = new Actor({
                    collisionType: CollisionType.PreventCollision,
                    anchor: vec(0.5, 0.5),
                    width: 24,
                    height: 24,
                })
                ring = {
                    actor,
                    completed: progress.completed,
                    displayed: progress.completed,
                    required: progress.required,
                }
                const state = ring
                actor.graphics.use(
                    new Canvas({
                        width: 24,
                        height: 24,
                        cache: false,
                        smoothing: false,
                        draw: (context) =>
                            drawPurificationRing(context, state.displayed, state.required),
                    })
                )
                actor.on('preupdate', (event: PreUpdateEvent) => {
                    state.displayed = Math.min(
                        state.completed,
                        state.displayed + event.elapsed / 350
                    )
                })
                this.rings.set(grave.id, ring)
                this.engine.add(actor)
            }
            ring.completed = progress.completed
            ring.required = progress.required
            ring.actor.graphics.isVisible = progress.completed > 0
            ring.actor.pos = vec(grave.position.x, grave.position.y - 30)
            ring.actor.z = grave.position.y + 6
        }
        for (const [id, { actor }] of this.rings) {
            if (visible.has(id)) continue
            actor.kill()
            this.rings.delete(id)
        }
    }

    private sync(grave: WorldGraveSnapshot, bitmap: HTMLCanvasElement): void {
        let entry = this.actors.get(grave.id)
        if (entry?.phase !== grave.phase) {
            entry?.actor.kill()
            const actor = new Actor({
                collisionType: CollisionType.PreventCollision,
                anchor: vec(0, 0),
                width: 16,
                height: 16,
            })
            actor.graphics.use(grave.phase === 'ruined' ? rubbleGraphic() : graveGraphic(bitmap))
            entry = { actor, phase: grave.phase }
            this.actors.set(grave.id, entry)
            this.engine.add(actor)
        }
        entry.actor.pos = vec(grave.position.x - 8, grave.position.y - 14)
        entry.actor.z = grave.position.y
    }
}

export function drawPurificationRing(
    context: CanvasRenderingContext2D,
    completed: number,
    required: number
): void {
    const count = Math.max(1, required)
    for (let index = 0; index < count; index++) {
        const from = -Math.PI / 2 + (index * Math.PI * 2) / count + 0.12
        const to = -Math.PI / 2 + ((index + 1) * Math.PI * 2) / count - 0.12
        context.beginPath()
        context.arc(12, 12, 9, from, to)
        context.strokeStyle = '#293e42ee'
        context.lineWidth = 3
        context.stroke()
        const fill = Math.max(0, Math.min(1, completed - index))
        if (fill === 0) continue
        context.beginPath()
        context.arc(12, 12, 9, from, from + (to - from) * fill)
        context.strokeStyle = '#f1d78c'
        context.stroke()
    }
}

function graveGraphic(bitmap: HTMLCanvasElement): Canvas {
    return new Canvas({
        width: 16,
        height: 16,
        cache: true,
        smoothing: false,
        draw: (context) => context.drawImage(bitmap, 0, 0),
    })
}

function rubbleGraphic(): Canvas {
    return new Canvas({
        width: 16,
        height: 16,
        cache: true,
        smoothing: false,
        draw: (context) => {
            context.fillStyle = '#26322c99'
            context.fillRect(1, 12, 14, 3)
            for (const [x, y, width, height] of [
                [2, 10, 5, 3],
                [8, 8, 4, 5],
                [12, 12, 3, 2],
            ]) {
                context.fillStyle = '#606e69'
                context.fillRect(x!, y!, width!, height!)
                context.fillStyle = '#9da699'
                context.fillRect(x!, y!, width!, 1)
            }
        },
    })
}
