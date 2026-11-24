import type {
    GameEventPayload,
    MagicEffectSnapshot,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import {
    advanceMagicProjectile,
    type MagicProjectile,
} from './magicProjectiles'
import {
    activeMagicChannel,
    bindMagicCombat,
    magicCombatFor,
} from './magicState'

type ProjectileEffect = Extract<
    MagicEffectSnapshot,
    { phase: 'flight' | 'impact' }
>
const noChannels: ReadonlySet<GameCharacter> = new Set()

export class MagicCombat {
    private readonly channels = new Map<string, Set<GameCharacter>>()
    private readonly effectIds = new WeakMap<
        GameCharacter | MagicProjectile,
        string
    >()
    private readonly windingUp = new WeakSet<GameCharacter>()
    private effectSequence = 0
    private readonly projectiles = new Map<string, MagicProjectile>()
    private readonly impacts = new Map<
        string,
        { effect: ProjectileEffect; locationId: string }
    >()

    public addChannel(actor: GameCharacter, locationId: string): void {
        const channels =
            this.channels.get(locationId) ?? new Set<GameCharacter>()
        channels.add(actor)
        this.channels.set(locationId, channels)
        this.assignEffectId(actor)
    }

    public removeChannel(actor: GameCharacter, locationId: string): void {
        const channels = this.channels.get(locationId)
        channels?.delete(actor)
        if (channels?.size === 0) {
            this.channels.delete(locationId)
        }
    }

    public channelsIn(locationId: string): ReadonlySet<GameCharacter> {
        return this.channels.get(locationId) ?? noChannels
    }

    public launch(projectile: MagicProjectile): void {
        this.projectiles.set(projectile.id, projectile)
        if (!projectile.launched) {
            this.windingUp.add(projectile.actor)
        }
        this.assignEffectId(projectile)
    }

    public isWindingUp(actor: GameCharacter): boolean {
        return this.windingUp.has(actor)
    }

    public hasUnresolvedCombat(locationId: string, now: number): boolean {
        for (const projectile of this.projectiles.values()) {
            if (projectile.locationId === locationId) {
                return true
            }
        }
        for (const caster of this.channelsIn(locationId)) {
            if (activeMagicChannel(caster, now)?.abilityId === 'chains') {
                return true
            }
        }
        return false
    }

    private assignEffectId(instance: GameCharacter | MagicProjectile): void {
        this.effectIds.set(instance, `magic-${String(++this.effectSequence)}`)
    }

    public advance(
        now: number,
        contextFor: (locationId: string) => AbilityContext
    ): GameEventPayload[] {
        const events: GameEventPayload[] = []
        const contexts = new Map<string, AbilityContext>()
        for (const [id, projectile] of this.projectiles) {
            const { locationId } = projectile
            const context = contexts.get(locationId) ?? contextFor(locationId)
            contexts.set(locationId, context)
            const wasWindingUp = !projectile.launched
            const result = advanceMagicProjectile(projectile, context)
            if (wasWindingUp && (projectile.launched || result !== undefined)) {
                this.windingUp.delete(projectile.actor)
            }
            if (result === undefined) {
                continue
            }
            this.projectiles.delete(id)
            events.push(
                ...result.events.map((event) =>
                    Object.assign(event, { locationId })
                )
            )
            if (result.effect !== undefined) {
                this.impacts.set(id, {
                    locationId,
                    effect: {
                        ...result.effect,
                        id: this.effectIds.get(projectile) ?? id,
                    },
                })
            }
        }
        for (const [id, { effect }] of this.impacts) {
            if (effect.expiresAt <= now) {
                this.impacts.delete(id)
            }
        }
        return events
    }

    public effectsFor(locationId: string, now: number): MagicEffectSnapshot[] {
        const effects: MagicEffectSnapshot[] = []
        for (const caster of this.channelsIn(locationId)) {
            const channel = activeMagicChannel(caster, now)
            if (channel?.abilityId === 'chains') {
                effects.push({
                    id: this.effectIds.get(caster) ?? '',
                    abilityId: 'chains',
                    center: { ...channel.center },
                    radius: channel.radius,
                    expiresAt: channel.completesAt,
                })
            }
        }
        for (const projectile of this.projectiles.values()) {
            if (projectile.locationId === locationId && projectile.launched) {
                effects.push({
                    id: this.effectIds.get(projectile) ?? projectile.id,
                    abilityId: projectile.abilityId,
                    phase: 'flight',
                    position: { ...projectile.position },
                    direction: { ...projectile.direction },
                    radius: projectile.radius,
                    expiresAt:
                        projectile.launchedAt +
                        Math.ceil((projectile.range / projectile.speed) * 1000),
                })
            }
        }
        for (const impact of this.impacts.values()) {
            if (
                impact.locationId === locationId &&
                impact.effect.expiresAt > now
            ) {
                effects.push(impact.effect)
            }
        }
        return effects
    }
}

export function ensureMagicCombat(
    actor: GameCharacter,
    context: AbilityContext
): MagicCombat {
    const combat = context.magic ?? magicCombatFor(actor) ?? new MagicCombat()
    bindMagicCombat(combat, new Set([actor, ...context.characters]))
    return combat
}
