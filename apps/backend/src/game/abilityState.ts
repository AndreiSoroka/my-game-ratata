import type {
    AbilityId,
    CharacterAbilitiesSnapshot,
    CharacterArchetype,
    HeroClass,
    PrayerAbilityId,
    PrayerIntent,
    Vector2,
} from '@my-game-ratata/contracts'

import { snapshotAbilityUsage } from './abilityUsage'
import type { GameCharacter } from './character'
import { prayerParameters, snapshotPrayerParameters } from './prayerParameters'

interface PrayerCastBase {
    targetId: string
    abilityId: PrayerAbilityId
    receiptId: string
    startedAt: number
    completesAt: number
    patron: GameCharacter['progression']['patron']
}
export type PrayerCast = PrayerCastBase &
    (
        | { mode?: 'revive' }
        | {
              mode: 'prayer' | 'purify_grave'
              intent: PrayerIntent
              receiptId: string
              origin: Vector2
              locationId: string
              hpAtStart: number
          }
    )
export interface CharacterAbilityState {
    lastPrayerAbilityId: PrayerAbilityId | null
    prayerSequence: number
    known: Set<AbilityId>
    availableAt: Partial<Record<AbilityId, number>>
    barrier: {
        remaining: number
        expiresAt: number
        practiced: boolean
        resourceSpend?: import('./resourcePractice').ResourceSpendReceipt
    } | null
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
        lastPrayerAbilityId: null,
        prayerSequence: 0,
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
        parameters: snapshotAbilityUsage(actor, known),
        cooldowns,
        ...(known.includes('pray') ? { prayer: prayerParameters(actor) } : {}),
        prayers: snapshotPrayerParameters(actor, known),
        ...(actor.abilities.lastPrayerAbilityId !== null &&
        known.includes(actor.abilities.lastPrayerAbilityId)
            ? { lastPrayerAbilityId: actor.abilities.lastPrayerAbilityId }
            : {}),
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
              abilityId: cast.abilityId,
              targetId: cast.targetId,
              startedAt: cast.startedAt,
              completesAt: cast.completesAt,
              ...(cast.mode === 'prayer' || cast.mode === 'purify_grave'
                  ? {
                        mode:
                            cast.intent.mode === 'devotion'
                                ? ('restore' as const)
                                : cast.intent.mode,
                        ...(cast.intent.mode === 'purify_grave'
                            ? { target: cast.intent.target }
                            : {}),
                    }
                  : {}),
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
