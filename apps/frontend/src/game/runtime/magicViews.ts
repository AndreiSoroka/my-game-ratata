import type {
    MagicEffectSnapshot,
    PortalEndpointSnapshot,
    Vector2,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { Actor, Canvas, type Engine, type Graphic, type ImageSource, Sprite, vec } from 'excalibur'

const spriteSize = 48
const frameMs = 75

interface MagicView {
    actor: Actor
    expiresAt: number
    frames?: readonly Graphic[]
    impact: boolean
    frame: number
}

/** Reconciles the current map's effects. Frame timing is presentation-only. */
export class MagicViews {
    private readonly views = new Map<string, MagicView>()
    private serverClockOffset = 0
    private readonly portal = portalGraphic()
    private readonly fireSprites: readonly [Sprite[], Sprite[]]
    private readonly ashFrames = [ashFrames(drawAshFlight), ashFrames(drawAshImpact)] as const
    private readonly reducedMotion =
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

    public constructor(
        private readonly engine: Engine,
        fireImage: ImageSource
    ) {
        this.fireSprites = [fireFrames(fireImage, 0), fireFrames(fireImage, 1)]
        engine.on('postupdate', this.updateFrames)
    }

    public sync(snapshot: WorldSnapshot, visible: (position: Vector2) => boolean): void {
        this.serverClockOffset = snapshot.serverTime - performance.now()
        const live = new Set<string>()
        for (const effect of snapshot.magicEffects ?? []) {
            const position = effect.abilityId === 'chains' ? effect.center : effect.position
            if (effect.expiresAt <= snapshot.serverTime || !visible(position)) continue
            const key = 'phase' in effect ? `${effect.id}:${effect.phase}` : effect.id
            live.add(key)
            const view = this.views.get(key) ?? this.createEffect(key, effect)
            view.actor.pos = vec(position.x, position.y)
            view.actor.z = position.y + ('phase' in effect ? 4 : -4)
            view.expiresAt = effect.expiresAt
        }
        this.syncPortals(snapshot.portals ?? [], snapshot.serverTime, visible, live)
        for (const [key, view] of this.views) {
            if (live.has(key)) continue
            view.actor.kill()
            this.views.delete(key)
        }
        this.updateFrames()
    }

    public clear(): void {
        for (const view of this.views.values()) view.actor.kill()
        this.views.clear()
    }

    public dispose(): void {
        this.clear()
        this.engine.off('postupdate', this.updateFrames)
    }

    private syncPortals(
        portals: readonly PortalEndpointSnapshot[],
        now: number,
        visible: (position: Vector2) => boolean,
        live: Set<string>
    ): void {
        for (const portal of portals) {
            if (portal.expiresAt <= now || !visible(portal.position)) continue
            const key = `portal:${portal.id}`
            live.add(key)
            const view = this.views.get(key) ?? this.add(key)
            view.actor.graphics.use(this.portal)
            view.actor.pos = vec(portal.position.x, portal.position.y - 6)
            view.actor.z = portal.position.y
            view.expiresAt = portal.expiresAt
        }
    }

    private add(key: string, impact = false): MagicView {
        const actor = new Actor({ anchor: vec(0.5, 0.5) })
        const view = { actor, expiresAt: 0, impact, frame: -1 }
        this.views.set(key, view)
        this.engine.add(actor)
        return view
    }

    private createEffect(key: string, effect: MagicEffectSnapshot): MagicView {
        const view = this.add(key, 'phase' in effect && effect.phase === 'impact')
        if (effect.abilityId === 'chains') {
            view.actor.graphics.use(radiusGraphic(effect.radius, '#c4a0f9', '#8961b929'))
            return view
        }
        if (effect.phase === 'flight') {
            view.actor.rotation = Math.atan2(effect.direction.y, effect.direction.x)
            if (effect.abilityId === 'greater_fireball') view.actor.scale = vec(1.3, 1.3)
        } else if (effect.abilityId !== 'ash_exhaustion') {
            const circle = new Actor({ anchor: vec(0.5, 0.5), z: -1 })
            circle.graphics.use(radiusGraphic(effect.radius, '#fbb074', '#e16d2a24'))
            view.actor.addChild(circle)
        }
        const frameSet = view.impact ? 1 : 0
        if (effect.abilityId === 'ash_exhaustion') {
            const frames = this.ashFrames[frameSet]
            if (this.reducedMotion) view.actor.graphics.use(frames[view.impact ? 1 : 0]!)
            else view.frames = frames
        } else view.frames = this.fireSprites[frameSet]
        return view
    }

    private readonly updateFrames = (): void => {
        const now = performance.now() + this.serverClockOffset
        for (const [key, view] of this.views) {
            if (now >= view.expiresAt) {
                view.actor.kill()
                this.views.delete(key)
                continue
            }
            if (!view.frames) continue
            const count = view.frames.length
            const frame = view.impact
                ? Math.max(0, count - Math.ceil((view.expiresAt - now) / frameMs))
                : Math.floor(now / frameMs) % count
            if (frame === view.frame) continue
            view.frame = frame
            view.actor.graphics.use(view.frames[frame]!)
        }
    }
}

function ashFrames(draw: (context: CanvasRenderingContext2D, frame: number) => void): Canvas[] {
    return Array.from(
        { length: 4 },
        (_, frame) =>
            new Canvas({
                width: 40,
                height: 40,
                cache: true,
                smoothing: false,
                draw(context) {
                    context.translate(20, 20)
                    draw(context, frame)
                },
            })
    )
}

function drawAshFlight(context: CanvasRenderingContext2D, frame: number): void {
    context.fillStyle = '#633c79'
    context.beginPath()
    context.moveTo(-19, frame - 2)
    context.lineTo(-10, frame - 5)
    context.lineTo(-6, -7)
    context.lineTo(6, -7)
    context.lineTo(11, -2)
    context.lineTo(10, 3)
    context.lineTo(5, 7)
    context.lineTo(-5, 6)
    context.lineTo(-11, 2 + frame)
    context.closePath()
    context.fill()
    context.fillStyle = '#c7a1df'
    context.fillRect(-5, -5, 11, 10)
    context.fillRect(6, -3, 3, 5)
    context.fillStyle = '#302338'
    context.fillRect(-2, -3, 7, 6)
    context.fillStyle = '#ead6f3'
    context.fillRect(3, -2, 3, 2)
    context.fillRect(-14, 6 - frame, 3, 1)
}

function drawAshImpact(context: CanvasRenderingContext2D, frame: number): void {
    const reach = 7 + frame * 3
    context.globalAlpha = 1 - frame * 0.2
    for (let fragment = 0; fragment < 6; fragment += 1) {
        context.save()
        context.rotate((fragment * Math.PI) / 3)
        context.fillStyle = '#895b9f'
        context.fillRect(reach - 4, -1, 7, 3)
        context.fillStyle = '#dcb9ed'
        context.fillRect(reach, -2, 3, 2)
        context.restore()
    }
    context.fillStyle = '#ead6f3'
    context.fillRect(-1, -1, 3, 3)
}

function fireFrames(image: ImageSource, row: number): Sprite[] {
    return Array.from(
        { length: 4 },
        (_, column) =>
            new Sprite({
                image,
                sourceView: {
                    x: column * spriteSize,
                    y: row * spriteSize,
                    width: spriteSize,
                    height: spriteSize,
                },
            })
    )
}

function radiusGraphic(radius: number, stroke: string, fill: string): Canvas {
    const size = Math.ceil(radius * 2) + 4
    return new Canvas({
        width: size,
        height: size,
        cache: true,
        smoothing: false,
        draw(context) {
            context.beginPath()
            context.arc(size / 2, size / 2, radius, 0, Math.PI * 2)
            context.fillStyle = fill
            context.fill()
            context.lineWidth = 2
            context.strokeStyle = stroke
            context.setLineDash([4, 3])
            context.stroke()
        },
    })
}

function portalGraphic(): Canvas {
    return new Canvas({
        width: 32,
        height: 36,
        cache: true,
        smoothing: false,
        draw(context) {
            context.fillStyle = '#392b578a'
            context.beginPath()
            context.ellipse(16, 29, 13, 5, 0, 0, 2 * Math.PI)
            context.fill()
            context.fillStyle = '#542e84cc'
            context.strokeStyle = '#e0b9ff'
            context.lineWidth = 2
            context.beginPath()
            context.ellipse(16, 17, 9, 13, 0, 0, 2 * Math.PI)
            context.fill()
            context.stroke()
            context.strokeStyle = '#ad7ded'
            context.beginPath()
            context.ellipse(16, 17, 5, 9, 0, 0, 2 * Math.PI)
            context.stroke()
        },
    })
}
