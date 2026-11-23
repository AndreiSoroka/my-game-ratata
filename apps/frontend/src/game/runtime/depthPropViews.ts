import type {
    AdventureResourceNode,
    ViewportBounds,
    WorldGraveSnapshot,
} from '@my-game-ratata/contracts'
import { Actor, Canvas, CollisionType, type Engine, vec } from 'excalibur'

import { GraveViews } from './graveViews'
import type { MapDepthProp } from './mapDepthProps'
import type { HarvestGraphics } from './tiledMap'
import { WorldInterestCache } from './worldInterest'

export class DepthPropViews {
    private actors = new Map<string, Actor>()
    private resources = new Map<string, { actor: Actor; phase: string }>()
    private readonly resourceInterest = new WorldInterestCache<AdventureResourceNode>()
    private readonly graveInterest = new WorldInterestCache<WorldGraveSnapshot>()
    private readonly graves: GraveViews
    private graphics: HarvestGraphics | undefined
    public constructor(private readonly engine: Engine) {
        this.graves = new GraveViews(engine)
    }

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
        this.graves.dispose()
        this.actors.clear()
        this.resources.clear()
        this.resourceInterest.clear()
        this.graveInterest.clear()
        this.graphics = undefined
    }

    /** Grave identity is independent of the emptied corpse container and character body. */
    public updateGraves(graves: readonly WorldGraveSnapshot[], viewBounds?: ViewportBounds): void {
        const update = this.graveInterest.update(graves, viewBounds)
        for (const grave of update.nodes) {
            const original = grave.propId === undefined ? undefined : this.actors.get(grave.propId)
            if (original) original.graphics.isVisible = true
        }
        this.graves.update(update.nodes, this.actors, this.graphics?.grave)
        this.hideAbsentProps(update.removed, viewBounds)
    }

    public updateResources(
        nodes: readonly AdventureResourceNode[],
        viewBounds?: ViewportBounds
    ): void {
        const update = this.resourceInterest.update(nodes, viewBounds)
        this.hideAbsentProps(update.removed, viewBounds)
        const active = new Set<string>()
        for (const node of update.nodes) {
            if (this.syncResource(node)) active.add(node.id)
        }
        for (const [id, entry] of this.resources) {
            if (!active.has(id)) {
                entry.actor.kill()
                this.resources.delete(id)
            }
        }
    }

    private hideAbsentProps(
        nodes: ReadonlyArray<{ propId?: string }>,
        viewBounds?: ViewportBounds
    ): void {
        if (viewBounds === undefined) return
        for (const node of nodes) {
            const original = node.propId === undefined ? undefined : this.actors.get(node.propId)
            if (original) original.graphics.isVisible = false
        }
    }

    private syncResource(node: AdventureResourceNode): boolean {
        if (node.source === undefined) return false
        const original = node.propId === undefined ? undefined : this.actors.get(node.propId)
        if (original !== undefined) {
            original.graphics.isVisible = node.phase === 'ready'
            if (node.phase === 'ready') return false
        }
        if (['stone', 'bush'].includes(node.source) || node.phase === 'removed') return false
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
        if (node.source === 'branches') return this.graphics?.branches
        if (node.phase === 'ready')
            return (
                this.graphics?.[node.treeProfile ?? node.visual ?? 'forest'] ??
                this.graphics?.forest
            )
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
