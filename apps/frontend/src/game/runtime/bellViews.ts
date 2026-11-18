import type {
    CityBellState,
    GameEventPayload,
    WorldObjectSnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import {
    Actor,
    Animation,
    AnimationStrategy,
    CollisionType,
    type Engine,
    type ImageSource,
    vec,
} from 'excalibur'

export interface BellImages {
    states: Record<CityBellState, ImageSource>
    swing: ImageSource[]
}
interface BellView {
    actor: Actor
    state: CityBellState
    activated: boolean
}

/** Cosmetic only: a server activation receipt animates once; snapshots never ring the bell. */
export class BellViews {
    private readonly views = new Map<string, BellView>()
    private readonly receipts = new Set<string>()
    private epoch: string | undefined
    public constructor(
        private readonly engine: Engine,
        private readonly images: BellImages
    ) {}

    public updateSnapshot(
        snapshot: WorldSnapshot,
        visible: (object: WorldObjectSnapshot) => boolean
    ): void {
        this.update(snapshot.adventure?.worldObjects ?? [], snapshot.serverEpoch, visible)
    }

    public update(
        objects: readonly WorldObjectSnapshot[],
        epoch: string | undefined,
        visible: (object: WorldObjectSnapshot) => boolean
    ): void {
        if (epoch !== this.epoch) {
            this.clear()
            this.receipts.clear()
            this.epoch = epoch
        }
        const bells = objects.filter((object) => object.kind === 'bell' && object.bell)
        const ids = new Set(bells.map((bell) => bell.id))
        for (const [id, view] of this.views) {
            if (!ids.has(id)) {
                view.actor.kill()
                this.views.delete(id)
            }
        }
        for (const bell of bells) {
            const state = bell.bell!.state
            const view = this.views.get(bell.id) ?? this.create(bell, state)
            view.actor.pos = vec(
                bell.bounds.x + bell.bounds.width / 2,
                bell.bounds.y + bell.bounds.height
            )
            view.actor.z = view.actor.pos.y
            view.actor.graphics.isVisible = visible(bell)
            if (view.state !== state && !view.activated)
                view.actor.graphics.use(this.images.states[state].toSprite())
            view.state = state
        }
    }

    public receive(event: GameEventPayload): void {
        if (
            event.kind !== 'bell_activate' ||
            !event.eventId ||
            !event.objectId ||
            this.receipts.has(event.eventId)
        )
            return
        this.receipts.add(event.eventId)
        if (this.receipts.size > 64) this.receipts.delete(this.receipts.values().next().value!)
        const view = this.views.get(event.objectId)
        if (!view?.actor.graphics.isVisible) return
        view.activated = true
        view.actor.graphics.use(
            new Animation({
                frames: [...this.images.swing, this.images.states.active].map((image) => ({
                    graphic: image.toSprite(),
                    duration: 150,
                })),
                strategy: AnimationStrategy.Freeze,
            })
        )
    }

    public clear(): void {
        for (const view of this.views.values()) view.actor.kill()
        this.views.clear()
    }

    private create(bell: WorldObjectSnapshot, state: CityBellState): BellView {
        const actor = new Actor({
            anchor: vec(0.5, 60 / 64),
            collisionType: CollisionType.PreventCollision,
            width: 48,
            height: 64,
        })
        actor.graphics.use(this.images.states[state].toSprite())
        const view = { actor, state, activated: false }
        this.views.set(bell.id, view)
        this.engine.add(actor)
        return view
    }
}
