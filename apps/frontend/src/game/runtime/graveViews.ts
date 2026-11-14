import type { WorldGraveSnapshot } from '@my-game-ratata/contracts'
import { Actor, Canvas, CollisionType, type Engine, vec } from 'excalibur'

/** Snapshot-owned grave phases never change collision or the independent corpse container. */
export class GraveViews {
    private actors = new Map<string, { actor: Actor; phase: WorldGraveSnapshot['phase'] }>()
    private hiddenProps = new Set<Actor>()

    public constructor(private readonly engine: Engine) {}

    public update(
        graves: readonly WorldGraveSnapshot[],
        originals: ReadonlyMap<string, Actor>,
        bitmap?: HTMLCanvasElement
    ): void {
        for (const actor of this.hiddenProps) actor.graphics.isVisible = true
        this.hiddenProps.clear()
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
