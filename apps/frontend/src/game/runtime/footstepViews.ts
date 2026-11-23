import type { WorldSnapshot } from '@my-game-ratata/contracts'
import {
    Actor,
    Canvas,
    CollisionType,
    type Engine,
    GraphicsGroup,
    type ImageSource,
    vec,
} from 'excalibur'

type HeardFootstep = NonNullable<WorldSnapshot['heardFootsteps']>[number]

interface FootstepView {
    actor: Actor
    expiresAt: number
}

const fadeMs = 240

/** A sound stays where it was heard, independent of the source character. */
export class FootstepViews {
    private readonly views = new Map<number, FootstepView>()
    private graphic: GraphicsGroup | undefined
    private serverClockOffset = 0

    public constructor(
        private readonly engine: Engine,
        private readonly boots: ImageSource | undefined
    ) {
        engine.on('postupdate', this.update)
    }

    public sync(
        snapshot: Pick<WorldSnapshot, 'heardFootsteps' | 'serverTime'>,
        observerAlive: boolean,
        depth: number
    ): void {
        const { serverTime } = snapshot
        const footsteps = observerAlive ? (snapshot.heardFootsteps ?? []) : []
        this.serverClockOffset = serverTime - performance.now()
        const active = new Set<number>()
        for (const footstep of footsteps) {
            if (footstep.expiresAt <= serverTime) continue
            active.add(footstep.id)
            if (!this.views.has(footstep.id)) this.add(footstep, depth)
        }
        for (const id of this.views.keys()) if (!active.has(id)) this.remove(id)
        this.update()
    }

    public ids(): number[] {
        return [...this.views.keys()]
    }

    public clear(): void {
        for (const id of this.views.keys()) this.remove(id)
    }

    public dispose(): void {
        this.clear()
        this.engine.off('postupdate', this.update)
    }

    private add({ id, position, expiresAt }: HeardFootstep, depth: number): void {
        if (!this.boots) return
        this.graphic ??= bootMarker(this.boots)
        const actor = new Actor({
            anchor: vec(0.5, 1),
            collisionType: CollisionType.PreventCollision,
            pos: vec(position.x, position.y),
            z: depth,
        })
        actor.graphics.use(this.graphic)
        this.views.set(id, { actor, expiresAt })
        this.engine.add(actor)
    }

    private remove(id: number): void {
        this.views.get(id)?.actor.kill()
        this.views.delete(id)
    }

    private readonly update = (): void => {
        const now = performance.now() + this.serverClockOffset
        for (const [id, view] of this.views) {
            const left = view.expiresAt - now
            if (left <= 0) this.remove(id)
            else view.actor.graphics.opacity = Math.min(1, left / fadeMs)
        }
    }
}

function bootMarker(boots: ImageSource): GraphicsGroup {
    return new GraphicsGroup({
        members: [
            {
                offset: vec(0, 0),
                graphic: new Canvas({
                    width: 22,
                    height: 22,
                    cache: true,
                    smoothing: false,
                    draw(context) {
                        context.beginPath()
                        context.arc(11, 11, 9.5, 0, 2 * Math.PI)
                        context.fillStyle = '#253230'
                        context.fill()
                        context.lineWidth = 1.5
                        context.strokeStyle = '#e5cc97'
                        context.stroke()
                    },
                }),
            },
            {
                offset: vec(3, 3),
                graphic: boots.toSprite({ destSize: { width: 16, height: 16 } }),
            },
        ],
    })
}
