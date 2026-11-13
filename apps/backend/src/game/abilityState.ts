import type {
    AbilityId,
    CharacterAbilitiesSnapshot,
    CharacterArchetype,
    HeroClass,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'

export interface PrayerCast {
    targetId: string
    startedAt: number
    completesAt: number
    patron: GameCharacter['progression']['patron']
}
export interface CharacterAbilityState {
    known: Set<AbilityId>
    availableAt: Partial<Record<AbilityId, number>>
    barrier: { remaining: number; expiresAt: number; practiced: boolean } | null
    casting: PrayerCast | null
    untrainableHpDamage: number
}
export function createAbilityState(
    heroClass: HeroClass | undefined,
    archetype: CharacterArchetype
): CharacterAbilityState {
    const known = new Set<AbilityId>()
    if (heroClass === 'cleric') {
        known.add('pray')
    }
    if (heroClass === 'arcanist') {
        known.add('spark')
        known.add('barrier')
    }
    if (heroClass === 'ranger') {
        known.add('shot')
    }
    if (archetype === 'skeleton') {
        known.add('skeleton_strike')
    }
    return {
        known,
        availableAt: {},
        barrier: null,
        casting: null,
        untrainableHpDamage: 0,
    }
}
export function knowsAbility(actor: GameCharacter, id: AbilityId): boolean {
    if (id === 'fireball' || id === 'greater_fireball') {
        return actor.progression.skills[id].unlocked
    }
    return actor.abilities.known.has(id)
}
export function clearAbilityEffects(actor: GameCharacter): void {
    actor.abilities.barrier = null
    actor.abilities.casting = null
    actor.abilities.untrainableHpDamage = 0
}
export function snapshotAbilities(
    actor: GameCharacter,
    now: number
): CharacterAbilitiesSnapshot {
    const known = [...actor.abilities.known]
    for (const id of ['fireball', 'greater_fireball'] as const) {
        if (knowsAbility(actor, id)) {
            known.push(id)
        }
    }
    const cooldowns: Partial<Record<AbilityId, number>> = {}
    for (const id of known) {
        cooldowns[id] = Math.max(
            0,
            (actor.abilities.availableAt[id] ?? 0) - now
        )
    }
    cooldowns.pray = Math.max(
        cooldowns.pray ?? 0,
        actor.progression.prayerAvailableAt - now,
        0
    )
    for (const id of ['fireball', 'greater_fireball'] as const) {
        if (known.includes(id)) {
            cooldowns[id] = Math.max(
                0,
                actor.progression.spellAvailableAt - now
            )
        }
    }
    return {
        known,
        cooldowns,
        barrier: snapshotBarrier(actor, now),
        casting: snapshotCast(actor),
    }
}
function snapshotBarrier(
    actor: GameCharacter,
    now: number
): CharacterAbilitiesSnapshot['barrier'] {
    const barrier = actor.abilities.barrier
    return actor.alive &&
        barrier !== null &&
        barrier.expiresAt > now &&
        barrier.remaining > 0
        ? { remaining: barrier.remaining, expiresAt: barrier.expiresAt }
        : null
}
function snapshotCast(
    actor: GameCharacter
): CharacterAbilitiesSnapshot['casting'] {
    const cast = actor.abilities.casting
    return actor.alive && cast !== null
        ? {
              abilityId: 'pray',
              targetId: cast.targetId,
              startedAt: cast.startedAt,
              completesAt: cast.completesAt,
          }
        : null
}

export function consumeHealingProvenance(
    actor: GameCharacter,
    amount: number,
    missingBefore: number
): number {
    const tainted = Math.min(actor.abilities.untrainableHpDamage, missingBefore)
    const untrainable = Math.min(tainted, amount)
    actor.abilities.untrainableHpDamage = tainted - untrainable
    return amount - untrainable
}
