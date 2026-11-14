import type { AdventureResourceNode, WorldGraveSnapshot } from '@my-game-ratata/contracts'
import { Actor, Canvas, CollisionType, type Engine, vec } from 'excalibur'

import type { MapDepthProp } from './mapDepthProps'
import type { HarvestGraphics } from './tiledMap'

export class DepthPropViews {
    private actors = new Map<string, Actor>()
    private resources = new Map<string, { actor: Actor; phase: string }>()
    private graves = new Map<string, Actor>()
    private graphics: HarvestGraphics | undefined
    public constructor(private readonly engine: Engine) {}

    public setProps(props: MapDepthProp[], graphics?: HarvestGraphics): void {
        this.dispose()
        this.graphics = graphics
        for (const prop of props) {
            this.actors.set(prop.id, this.create(prop.bitmap, prop.x, prop.y, prop.baseY))
        }
    }

    public dispose(): void {
        for (const actor of this.actors.values()) actor.kill()
        for (const { actor } of this.resources.values()) actor.kill()
        for (const actor of this.graves.values()) actor.kill()
        this.actors.clear()
        this.resources.clear()
        this.graves.clear()
        this.graphics = undefined
    }

    /** Grave identity is independent of the emptied corpse container and character body. */
    public updateGraves(graves: readonly WorldGraveSnapshot[]): void {
        const active = new Set(graves.map((grave) => grave.id))
        for (const [id, actor] of this.graves) {
            if (!active.has(id)) {
                actor.kill()
                this.graves.delete(id)
            }
        }
        const bitmap = this.graphics?.grave
        if (!bitmap) return
        for (const grave of graves) {
            const x = grave.position.x - bitmap.width / 2
            const y = grave.position.y + 2 - bitmap.height
            const actor = this.graves.get(grave.id) ?? this.create(bitmap, x, y, grave.position.y)
            actor.pos = vec(x, y)
            actor.z = grave.position.y
            this.graves.set(grave.id, actor)
        }
    }

    public updateResources(nodes: readonly AdventureResourceNode[]): void {
        const active = new Set<string>()
        for (const node of nodes) {
            if (this.syncResource(node)) active.add(node.id)
        }
        for (const [id, entry] of this.resources) {
            if (!active.has(id)) {
                entry.actor.kill()
                this.resources.delete(id)
            }
        }
    }

    private syncResource(node: AdventureResourceNode): boolean {
        if (node.source === undefined) return false
        const original = node.propId === undefined ? undefined : this.actors.get(node.propId)
        if (original !== undefined) {
            original.graphics.isVisible = node.phase === 'ready'
            if (node.phase === 'ready') return false
        }
        if (node.source === 'stone') return false
        const existing = this.resources.get(node.id)
        if (existing?.phase === node.phase) return true
        existing?.actor.kill()
        const graphic = this.graphicFor(node)
        if (graphic === undefined) return false
        const x = node.position.x - graphic.width / 2
        const y = node.position.y + 8 - graphic.height
        this.resources.set(node.id, {
            actor: this.create(graphic, x, y, node.position.y + 6),
            phase: node.phase ?? 'ready',
        })
        return true
    }

    private graphicFor(node: AdventureResourceNode): HTMLCanvasElement | undefined {
        if (node.phase === 'ready') return this.graphics?.forest
        return node.phase === 'growing' ? this.graphics?.sapling : this.graphics?.stump
    }

    private create(bitmap: HTMLCanvasElement, x: number, y: number, baseY: number): Actor {
        const actor = new Actor({
            collisionType: CollisionType.PreventCollision,
            anchor: vec(0, 0),
            pos: vec(x, y),
            width: bitmap.width,
            height: bitmap.height,
            z: baseY,
        })
        actor.graphics.use(
            new Canvas({
                width: bitmap.width,
                height: bitmap.height,
                cache: true,
                smoothing: false,
                draw: (context) => context.drawImage(bitmap, 0, 0),
            })
        )
        this.engine.add(actor)
        return actor
    }
}
