import {
    doorApproachPoints,
    type DoorState,
    type Vector2,
    type WorldObjectSnapshot,
} from '@my-game-ratata/contracts'
import { Actor, Canvas, type Engine, vec } from 'excalibur'

interface DoorView {
    actor: Actor
    state: DoorState
}

/** Door leaves sit over the authored arch and stay on the map when a roof is removed. */
export class DoorViews {
    private readonly views = new Map<string, DoorView>()
    private readonly leaves = {
        open: doorLeaf('open'),
        closed: doorLeaf('closed'),
        locked: doorLeaf('locked'),
    }

    public constructor(private readonly engine: Engine) {}

    public update(
        objects: readonly WorldObjectSnapshot[],
        visible: (point: Vector2) => boolean
    ): void {
        const active = new Set<string>()
        for (const object of objects) {
            if (object.kind !== 'door' || !object.door) continue
            const { bounds, id, door } = object
            active.add(id)
            const view = this.views.get(id) ?? this.create(object, door.state)
            if (view.state !== door.state) {
                view.actor.graphics.use(this.leaves[door.state])
                view.state = door.state
            }
            view.actor.graphics.isVisible = doorApproachPoints(bounds, door.state).some(visible)
        }
        for (const [id, view] of this.views) {
            if (active.has(id)) continue
            view.actor.kill()
            this.views.delete(id)
        }
    }

    public clear(): void {
        for (const view of this.views.values()) view.actor.kill()
        this.views.clear()
    }

    private create({ id, bounds }: WorldObjectSnapshot, state: DoorState): DoorView {
        const actor = new Actor({
            pos: vec(bounds.x, bounds.y),
            z: bounds.y + bounds.height,
            anchor: vec(0, 0),
            width: bounds.width,
            height: bounds.height,
            scale: vec(bounds.width / 16, bounds.height / 16),
        })
        actor.graphics.use(this.leaves[state])
        this.engine.add(actor)
        const view = { actor, state }
        this.views.set(id, view)
        return view
    }
}

function doorLeaf(state: DoorState): Canvas {
    return new Canvas({
        width: 16,
        height: 16,
        cache: true,
        smoothing: false,
        draw: (ctx) => {
            const width = state === 'open' ? 4 : 12
            ctx.fillStyle = '#291c16'
            ctx.fillRect(2, 2, width, 13)
            ctx.fillStyle = '#72472d'
            ctx.fillRect(3, 3, width - 2, 11)
            ctx.fillStyle = '#a06d49'
            ctx.fillRect(3, 3, 1, 10)
            if (state === 'open') return
            ctx.fillStyle = '#543322'
            ctx.fillRect(6, 3, 1, 11)
            ctx.fillRect(9, 3, 1, 11)
            ctx.fillRect(3, 5, 10, 1)
            ctx.fillRect(3, 12, 10, 1)
            ctx.fillStyle = '#d2a166'
            ctx.fillRect(11, 8, 2, 2)
            if (state === 'locked') {
                ctx.fillStyle = '#b5a08a'
                ctx.fillRect(6, 8, 3, 3)
                ctx.fillStyle = '#291c16'
                ctx.fillRect(7, 9, 1, 2)
            }
        },
    })
}
