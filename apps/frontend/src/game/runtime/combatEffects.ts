import type {
    CharacterSnapshot,
    GameEventPayload,
    WorldCombatTarget,
} from '@my-game-ratata/contracts'
import { Actor, Color, type Engine, Font, Label, type PostUpdateEvent, vec } from 'excalibur'

import { combatEffectCues, type EffectCue, eventCaption } from './combatEffectPlan'
import { combatEffectPose, isMeleeEffect } from './combatEffectPose'
import { hitColors, hitQuality } from './combatHitLabel'
import { CombatParticles } from './combatParticles'
import { EFFECT_BUDGET } from './effectBudget'
import { BARRIER_COLOR, EffectGraphics } from './effectGraphics'
import { deityColors } from './prayerGraphics'

type EffectTarget = Pick<CharacterSnapshot, 'position'>

interface Effect {
    actor: Actor
    started: number
    duration: number
    from: { x: number; y: number }
    cue?: EffectCue
    particles?: ReturnType<CombatParticles['burst']>
}
// Shares the conservative 32-effect scene budget with damage, barriers and stun labels.
export const MAX_TRANSIENT_EFFECTS = EFFECT_BUDGET.transient

/** Every burst and trajectory consumes authoritative events; it never resolves a hit. */
export class CombatEffects {
    private now = 0
    private effects: Effect[] = []
    private readonly graphics = new EffectGraphics()
    private readonly barriers = new Map<string, Actor>()
    private readonly waves = new Map<string, number>()
    private readonly particles: CombatParticles
    private readonly reduced =
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    public constructor(
        private readonly engine: Engine,
        private readonly character: (id: string) => CharacterSnapshot | undefined,
        private readonly worldTarget: (
            target: WorldCombatTarget
        ) => EffectTarget | undefined = () => undefined
    ) {
        this.particles = new CombatParticles(engine, this.reduced)
        engine.on('postupdate', this.update)
    }
    public receive(event: GameEventPayload): void {
        const actor = this.character(event.actorId ?? '')
        const target = this.eventTarget(event)
        if (event.kind === 'cast' && event.phase !== 'started') this.stopChannel(event.actorId)
        if (!target) return
        if (actor) for (const cue of combatEffectCues(event, actor)) this.visual(cue)
        const caption = eventCaption(event)
        if (caption) this.label(target, caption, captionColor(event, actor))
    }
    public sync(characters: CharacterSnapshot[]): void {
        const active = new Set(
            characters
                .filter((character) => character.alive && character.abilities?.barrier)
                .map((character) => character.id)
        )
        this.pruneBarriers(active)
        for (const character of characters)
            if (active.has(character.id)) this.syncBarrier(character)
        for (const effect of this.effects) {
            if (channelEnded(effect.cue, this.character)) this.remove(effect)
        }
        this.effects = this.effects.filter((effect) => !effect.actor.isKilled())
    }
    private eventTarget(event: GameEventPayload): EffectTarget | undefined {
        if (event.target && event.kind !== 'attack') return this.worldTarget(event.target)
        const casterCaption =
            event.kind === 'cast' && event.abilityId === 'pray' && event.phase === 'completed'
        return this.character(
            event.kind === 'attack' || casterCaption
                ? (event.actorId ?? '')
                : (event.targetId ?? event.actorId ?? '')
        )
    }
    private pruneBarriers(active: Set<string>): void {
        for (const [id, view] of this.barriers) {
            if (active.has(id)) continue
            if (this.character(id)?.alive)
                this.visual({
                    kind: 'shards',
                    fromId: id,
                    targetId: id,
                    deity: 'lantern',
                    color: BARRIER_COLOR,
                    duration: 550,
                    count: 12,
                })
            view.kill()
            this.barriers.delete(id)
        }
    }
    private syncBarrier(character: CharacterSnapshot): void {
        let actor = this.barriers.get(character.id)
        if (!actor && this.barriers.size < EFFECT_BUDGET.barrier) {
            actor = new Actor({ anchor: vec(0.5, 0.5) })
            actor.graphics.use(this.graphics.get('barrier'))
            this.barriers.set(character.id, actor)
            this.engine.add(actor)
        }
        if (actor) {
            actor.pos = vec(character.position.x, character.position.y - 15)
            actor.z = character.position.y + 5
        }
    }
    public clear(): void {
        for (const effect of this.effects) this.remove(effect)
        this.effects = []
        for (const actor of this.barriers.values()) actor.kill()
        this.barriers.clear()
        this.waves.clear()
        this.particles.clear()
    }
    public dispose(): void {
        this.clear()
        this.engine.off('postupdate', this.update)
        this.graphics.clear()
    }
    private stopChannel(actorId: string | undefined): void {
        for (const effect of this.effects)
            if (effect.cue?.channel && effect.cue.fromId === actorId) this.remove(effect)
        this.effects = this.effects.filter((effect) => !effect.actor.isKilled())
    }
    private cueTarget(cue: EffectCue): EffectTarget | undefined {
        return cue.target ? this.worldTarget(cue.target) : this.character(cue.targetId)
    }
    private visual(cue: EffectCue): void {
        const from = this.character(cue.fromId),
            target = this.cueTarget(cue)
        if (!from || !target) return
        if (!this.admitWave(cue)) return
        const pose = combatEffectPose(cue, from, target, this.reduced)
        const actor = new Actor({
            anchor: vec(0.5, 0.5),
            pos: vec(pose.x, pose.y),
            z: pose.z,
            rotation: pose.rotation,
        })
        actor.graphics.use(this.graphics.get(cue.kind, cue.deity, cue.channel ? 0 : 1))
        const duration = this.reduced && !cue.channel ? 220 : cue.duration
        const effect = {
            actor,
            cue,
            started: this.now,
            duration,
            from: { x: actor.pos.x, y: actor.pos.y },
        }
        this.add(effect)
        if (!cue.channel) effect.actor.actions.fade(0, duration)
        const particles = this.particles.burst(cue, actor.pos, this.now)
        Object.assign(effect, { particles })
    }
    private label(target: EffectTarget, text: string, color: string): void {
        const actor = new Label({
            text,
            pos: vec(target.position.x, target.position.y - 42),
            z: target.position.y + 30,
            font: new Font({
                size: 8,
                bold: true,
                color: Color.fromHex(color),
                family: 'system-ui',
                shadow: { color: Color.Black, offset: vec(1, 1), blur: 0 },
            }),
        })
        actor.graphics.anchor = vec(0.5, 1)
        this.add({
            actor,
            started: this.now,
            duration: 1000,
            from: { x: actor.pos.x, y: actor.pos.y },
        })
        actor.actions.fade(0, 1000)
    }
    private add(effect: Effect): void {
        if (this.effects.length >= MAX_TRANSIENT_EFFECTS) this.remove(this.effects.shift()!)
        this.effects.push(effect)
        this.engine.add(effect.actor)
    }
    private remove(effect: Effect): void {
        effect.actor.actions.clearActions()
        effect.actor.kill()
        this.particles.release(effect.particles)
    }
    private admitWave(cue: EffectCue): boolean {
        if (!cue.wave) return true
        if ((this.waves.get(cue.fromId) ?? -1000) + 400 > this.now) return false
        this.waves.set(cue.fromId, this.now)
        return true
    }
    private animate(effect: Effect, progress: number): boolean {
        if (progress >= 1) return false
        const cue = effect.cue
        if (cue) {
            const target = this.cueTarget(cue)
            if (!target) return false
            this.animateVisual(effect, cue, target, progress)
        } else if (!this.reduced)
            effect.actor.pos = vec(effect.from.x, effect.from.y - progress * 8)
        return true
    }
    private animateVisual(
        effect: Effect,
        cue: EffectCue,
        target: EffectTarget,
        progress: number
    ): void {
        if (cue.channel) {
            effect.actor.graphics.use(this.graphics.get('casting', cue.deity, progress))
            effect.actor.pos = vec(target.position.x, target.position.y - 15)
            return
        }
        if (this.reduced || isMeleeEffect(cue.kind)) return
        if (cue.travel) {
            effect.actor.pos = vec(
                effect.from.x +
                    ((cue.projectile?.endpoint ?? target.position).x - effect.from.x) * progress,
                effect.from.y +
                    ((cue.projectile?.endpoint ?? target.position).y - 15 - effect.from.y) *
                        progress
            )
        } else if (cue.wave) effect.actor.scale = vec(0.2 + 0.8 * progress, 0.2 + 0.8 * progress)
        else effect.actor.pos = vec(effect.from.x, effect.from.y - progress * 8)
    }
    private readonly update = (event: PostUpdateEvent<Engine>): void => {
        this.now += Math.max(0, event.elapsed)
        this.particles.update(this.now)
        for (const [id, time] of this.waves) if (this.now - time > 1000) this.waves.delete(id)
        this.effects = this.effects.filter((effect) => {
            const keep = this.animate(effect, (this.now - effect.started) / effect.duration)
            if (!keep) this.remove(effect)
            return keep
        })
    }
}

function captionColor(event: GameEventPayload, actor: CharacterSnapshot | undefined): string {
    return event.kind === 'world_damage' || event.kind === 'miss'
        ? hitColors[event.kind === 'miss' ? 'miss' : hitQuality(event)]
        : event.kind === 'heal'
          ? '#a9ea8e'
          : deityColors[actor?.progression?.deity.id ?? 'hearth']
}
function channelEnded(
    cue: EffectCue | undefined,
    character: (id: string) => CharacterSnapshot | undefined
): boolean {
    return Boolean(cue?.channel && !character(cue.fromId)?.abilities?.casting)
}
