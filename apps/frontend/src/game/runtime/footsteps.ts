import {
    type FootstepSourceSnapshot,
    MOVEMENT_RULES,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { FootstepSurface } from './mapSurfaces'

export interface Footstep {
    actorId: string
    surface: FootstepSurface
    volume: number
    variant: number
    slime: boolean
}
interface Stride {
    position: Vector2
    seenAt: number
    playedAt: number
    startedAt: number
    firstStep: boolean
    distance: number
    step: number
}
export const footstepHearingRadius = MOVEMENT_RULES.playerFootstepHearingRadius

export function footstepGain(distance: number, radius: number = footstepHearingRadius): number {
    return Math.max(0, 1 - Math.max(0, distance) / radius) ** 2
}

function noiseMultiplier(actor: FootstepSourceSnapshot): number {
    if (actor.movement?.dashing) return MOVEMENT_RULES.dashNoiseMultiplier
    if (actor.movement?.mode === 'sneaking') {
        return MOVEMENT_RULES.sneakNoiseMultiplier
    }
    return 1
}

export class FootstepPlanner {
    private readonly strides = new Map<string, Stride>()

    public reset(): void {
        this.strides.clear()
    }

    public collect(
        actors: FootstepSourceSnapshot[],
        listenerId: string | undefined,
        now: number,
        surface: (point: Vector2) => FootstepSurface
    ): Footstep[] {
        const listener = actors.find((actor) => actor.id === listenerId)
        if (listener === undefined || !listener.alive) {
            this.reset()
            return []
        }
        const present = new Set(actors.map((actor) => actor.id))
        for (const id of this.strides.keys()) if (!present.has(id)) this.strides.delete(id)
        return actors
            .flatMap((actor) => {
                if (!this.advanceStride(actor, now)) return []
                const distance = Math.hypot(
                    actor.position.x - listener.position.x,
                    actor.position.y - listener.position.y
                )
                const noise = noiseMultiplier(actor)
                const volume =
                    footstepGain(distance, footstepHearingRadius * Math.sqrt(noise)) *
                    Math.min(1.3, noise)
                if (volume < 0.005) return []
                const stride = this.strides.get(actor.id)
                return [
                    {
                        actorId: actor.id,
                        surface: surface(actor.position),
                        volume,
                        variant: (stride?.step ?? 0) % 3,
                        slime: actor.archetype === 'slime',
                    },
                ]
            })
            .sort((a, b) => b.volume - a.volume)
            .slice(0, 6)
    }

    private advanceStride(actor: FootstepSourceSnapshot, now: number): boolean {
        const previous = this.strides.get(actor.id)
        const moved =
            previous === undefined
                ? 0
                : Math.hypot(
                      actor.position.x - previous.position.x,
                      actor.position.y - previous.position.y
                  )
        if (previous === undefined || moved > 64 || now - previous.seenAt > 1000) {
            this.strides.set(actor.id, {
                position: { ...actor.position },
                seenAt: now,
                playedAt: now,
                startedAt: now,
                firstStep: true,
                distance: 0,
                step: actor.id.length % 3,
            })
            return false
        }
        previous.position = { ...actor.position }
        previous.seenAt = now
        if (!actor.alive || moved < 0.05) {
            this.stopStride(previous, now)
            return false
        }
        previous.distance += moved
        const shouldPlay = this.consumeStep(previous, now, actor)
        // A one-tile wander can arrive between snapshots. Its real displacement is
        // audible before zero arrival velocity starts a fresh walking bout.
        if (Math.hypot(actor.velocity.x, actor.velocity.y) < 1) this.stopStride(previous, now)
        return shouldPlay
    }

    private consumeStep(stride: Stride, now: number, actor: FootstepSourceSnapshot): boolean {
        const interval = strideInterval(actor)
        const minimumDistance = stride.firstStep ? 10 : 26
        const minimumInterval = stride.firstStep ? Math.min(110, interval) : interval
        const lastStep = stride.firstStep ? stride.startedAt : stride.playedAt
        const shouldPlay = stride.distance >= minimumDistance && now - lastStep >= minimumInterval
        if (shouldPlay) {
            stride.distance = stride.firstStep ? 0 : stride.distance % 26
            stride.firstStep = false
            stride.playedAt = now
            stride.step += 1
        }
        return shouldPlay
    }

    private stopStride(stride: Stride, now: number): void {
        stride.distance = 0
        stride.firstStep = true
        stride.startedAt = now
    }
}

function strideInterval(actor: FootstepSourceSnapshot): number {
    if (actor.movement?.dashing) return 150
    if (actor.movement?.mode === 'sneaking') return 400
    return 240
}
