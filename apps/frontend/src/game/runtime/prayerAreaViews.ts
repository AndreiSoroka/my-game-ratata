import {
    type CharacterSnapshot,
    PRAYER_RULES,
    type PrayerActionId,
    snapshotPrayerParameters,
} from '@my-game-ratata/contracts'
import {
    Actor,
    Canvas,
    CollisionType,
    type Engine,
    GraphicsGroup,
    type ImageSource,
    type PreUpdateEvent,
    vec,
} from 'excalibur'

import {
    prayerAreaOpacity,
    prayerAreaPulseAmplitude,
    prayerAreaPulseDurationMs,
} from '../assets/prayerAreaAssets'
import { drawPrayerAreaOutline } from './prayerAreaOutline'

export type PrayerAreaImages = ReadonlyMap<PrayerActionId, ImageSource>

export interface PrayerAreaState {
    actorId: string
    abilityId: PrayerActionId
    radius: number
}

interface PrayerAreaView {
    actor: Actor
    abilityId: PrayerActionId
    radius: number
}

const spriteRadius = PRAYER_RULES.radius
const spriteDiameter = spriteRadius * 2
const outlinePadding = 1

function activePrayerCast(character: CharacterSnapshot, serverTime: number) {
    if (!character.alive || character.life?.retired || character.tags.includes('offline'))
        return undefined

    const cast = character.abilities?.casting
    return cast && cast.startedAt <= serverTime && cast.completesAt > serverTime ? cast : undefined
}

/** Visible channels are reconciled from snapshots, including when first seen mid-cast. */
export class PrayerAreaViews {
    private readonly views = new Map<string, PrayerAreaView>()
    private readonly graphics = new Map<PrayerActionId, GraphicsGroup>()
    private readonly reducedMotion =
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    private readonly outline = new Canvas({
        width: spriteDiameter + outlinePadding * 2,
        height: spriteDiameter + outlinePadding * 2,
        cache: true,
        smoothing: false,
        draw: (context) => {
            const center = spriteRadius + outlinePadding
            drawPrayerAreaOutline(context, center, center, spriteRadius)
        },
    })

    public constructor(
        private readonly engine: Engine,
        private readonly images: PrayerAreaImages
    ) {}

    public sync(characters: readonly CharacterSnapshot[], serverTime: number): void {
        const active = new Set<string>()
        for (const character of characters) {
            const cast = activePrayerCast(character, serverTime)
            if (!cast) continue

            const graphic = this.graphicFor(cast.abilityId)
            if (!graphic) continue
            const parameters = snapshotPrayerParameters(character, cast.abilityId)
            const radius = cast.radius ?? parameters.energyRecoveryRadius ?? parameters.radius
            if (!Number.isFinite(radius) || radius <= 0) continue

            active.add(character.id)
            const view =
                this.views.get(character.id) ??
                this.create(character.id, cast.abilityId, radius, graphic)
            if (view.abilityId !== cast.abilityId) {
                view.actor.graphics.use(graphic)
                view.abilityId = cast.abilityId
            }
            view.radius = radius
            view.actor.pos = vec(character.position.x, character.position.y)
            const scale = radius / spriteRadius
            view.actor.scale = vec(scale, scale)
        }
        for (const [id, view] of this.views) {
            if (active.has(id)) continue
            view.actor.kill()
            this.views.delete(id)
        }
    }

    public states(): PrayerAreaState[] {
        return Array.from(this.views, ([actorId, { abilityId, radius }]) => ({
            actorId,
            abilityId,
            radius,
        }))
    }

    public clear(): void {
        for (const view of this.views.values()) view.actor.kill()
        this.views.clear()
    }

    private graphicFor(abilityId: PrayerActionId): GraphicsGroup | undefined {
        const existing = this.graphics.get(abilityId)
        if (existing) return existing
        const image = this.images.get(abilityId)
        if (!image) return undefined

        const sprite = image.toSprite({
            destSize: { width: spriteDiameter, height: spriteDiameter },
        })
        const graphic = new GraphicsGroup({
            members: [
                { graphic: sprite, offset: vec(outlinePadding, outlinePadding) },
                { graphic: this.outline, offset: vec(0, 0) },
            ],
        })
        this.graphics.set(abilityId, graphic)
        return graphic
    }

    private create(
        id: string,
        abilityId: PrayerActionId,
        radius: number,
        graphic: GraphicsGroup
    ): PrayerAreaView {
        const actor = new Actor({
            anchor: vec(0.5, 0.5),
            collisionType: CollisionType.PreventCollision,
            // The terrain is at -100. Character bodies, cover and world props are Y-sorted above it.
            z: -99,
        })
        actor.graphics.use(graphic)
        actor.graphics.opacity = prayerAreaOpacity
        if (!this.reducedMotion) {
            let elapsedMs = 0
            actor.graphics.opacity = prayerAreaOpacity - prayerAreaPulseAmplitude
            actor.on('preupdate', (event: PreUpdateEvent) => {
                elapsedMs = (elapsedMs + event.elapsed) % prayerAreaPulseDurationMs
                actor.graphics.opacity =
                    prayerAreaOpacity -
                    prayerAreaPulseAmplitude *
                        Math.cos((elapsedMs * 2 * Math.PI) / prayerAreaPulseDurationMs)
            })
        }
        const view = { actor, abilityId, radius }
        this.views.set(id, view)
        this.engine.add(actor)
        return view
    }
}
