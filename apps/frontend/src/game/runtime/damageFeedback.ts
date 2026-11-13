import type { GameEventPayload } from '@my-game-ratata/contracts'
import {
    type Actor,
    Color,
    type Engine,
    Flash,
    Font,
    Label,
    type PostUpdateEvent,
    vec,
} from 'excalibur'

import {
    type DamageHit,
    damageNumberMs,
    DamageTimeline,
    hitFlashMs,
    maxDamageEffects,
} from './damagePresentation'

interface HitView {
    label: Label
    hit: DamageHit
    x: number
    y: number
}
interface FlashView {
    body: Actor
    flash: Flash
    until: number
    reacting: boolean
}

export class DamageFeedback {
    private readonly timeline = new DamageTimeline()
    private readonly numbers = new Map<number, HitView>()
    private readonly flashes = new Map<string, FlashView>()
    private now = 0
    private readonly reduced =
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

    public constructor(
        private readonly engine: Engine,
        private readonly bodyFor: (id: string) => Actor | undefined,
        private readonly refreshGraphic: (id: string) => void
    ) {
        engine.on('postupdate', this.onFrame)
    }

    public show(event: GameEventPayload, localTarget: boolean): void {
        const body = event.targetId === undefined ? undefined : this.bodyFor(event.targetId)
        const hit = this.timeline.receive(event, this.now, body?.graphics.isVisible ?? false)
        if (body === undefined || hit === undefined) return
        const view = this.flashFor(hit.targetId, body, localTarget)
        if (this.now >= view.until) {
            view.flash.reset()
            body.actions.runAction(view.flash)
            view.until = this.now + hitFlashMs
        }
        view.reacting = true
        this.addNumber(hit, body, localTarget)
        this.refreshGraphic(hit.targetId)
    }

    public elapsed(targetId: string): number | undefined {
        return this.timeline.elapsed(targetId, this.now)
    }

    public forget(targetId: string): void {
        const view = this.flashes.get(targetId)
        if (view !== undefined) {
            const visible = view.body.graphics.isVisible
            view.flash.stop()
            view.flash.update(0)
            view.body.graphics.isVisible = visible
            view.body.graphics.material = null
            view.body.graphics.offset = vec(0, 0)
            this.flashes.delete(targetId)
        }
        this.timeline.forget(targetId)
        for (const [id, number] of this.numbers) {
            if (number.hit.targetId === targetId) {
                number.label.kill()
                this.numbers.delete(id)
            }
        }
        this.refreshGraphic(targetId)
    }

    public clear(): void {
        for (const id of this.flashes.keys()) this.forget(id)
        for (const number of this.numbers.values()) number.label.kill()
        this.numbers.clear()
        this.timeline.clear()
    }

    public dispose(): void {
        this.clear()
        this.engine.off('postupdate', this.onFrame)
    }

    private flashFor(id: string, body: Actor, local: boolean): FlashView {
        const existing = this.flashes.get(id)
        if (existing !== undefined) return existing
        if (this.flashes.size >= maxDamageEffects) {
            const oldest = this.flashes.keys().next().value
            if (oldest !== undefined) this.forget(oldest)
        }
        const view = {
            body,
            flash: new Flash(body, Color.fromHex(local ? '#ff8479' : '#fff0d3'), hitFlashMs),
            until: this.now,
            reacting: false,
        }
        this.flashes.set(id, view)
        return view
    }

    private addNumber(hit: DamageHit, body: Actor, local: boolean): void {
        if (this.numbers.size >= maxDamageEffects) {
            const oldest = this.numbers.keys().next().value
            if (oldest !== undefined) {
                this.numbers.get(oldest)?.label.kill()
                this.numbers.delete(oldest)
            }
        }
        const x = body.pos.x + ((hit.id % 3) - 1) * 4
        const y = body.pos.y - 24
        const label = new Label({
            text: `−${hit.amount}`,
            pos: vec(x, y),
            z: body.z + 20,
            font: new Font({
                size: local ? 11 : 9,
                bold: true,
                color: Color.fromHex(local ? '#ff7770' : '#ffe8a4'),
                family: 'Pixelify Sans, system-ui, sans-serif',
                shadow: { color: Color.Black, offset: vec(1, 1), blur: 0 },
            }),
        })
        label.graphics.anchor = vec(0.5, 1)
        this.engine.add(label)
        this.numbers.set(hit.id, { label, hit, x, y })
    }

    private readonly onFrame = (event: PostUpdateEvent<Engine>): void => {
        this.now += Math.max(0, event.elapsed)
        for (const [id, number] of this.numbers) {
            const progress = (this.now - number.hit.startedAt) / damageNumberMs
            if (progress >= 1) {
                number.label.kill()
                this.numbers.delete(id)
            } else {
                number.label.pos = vec(number.x, number.y - (this.reduced ? 0 : progress * 18))
                number.label.graphics.opacity = 1 - progress * progress
            }
        }
        for (const [id, view] of this.flashes) {
            if (!view.reacting) continue
            const elapsed = this.elapsed(id)
            view.body.graphics.offset =
                !this.reduced && elapsed !== undefined && elapsed < hitFlashMs
                    ? vec(Math.floor(elapsed / 30) % 2 ? -1 : 1, 0)
                    : vec(0, 0)
            view.reacting = elapsed !== undefined
            this.refreshGraphic(id)
        }
    }
}
