import {
    ABILITY_DEFINITIONS,
    type AbilityId,
    type CharacterAbilitiesSnapshot,
    type CharacterArchetype,
    type HeroClass,
    type PrayerActionId,
    type PrayerIntent,
    type Vector2,
} from '@my-game-ratata/contracts'

import { snapshotAbilityUsage } from './abilityUsage'
import type { GameCharacter } from './character'
import {
    clearMagicChannel,
    magicRootedUntil,
    snapshotMagicChannel,
} from './magicState'
import type {
    MotherPrayerCastState,
    MotherPrayerPlan,
} from './motherPrayerPlan'
import { prayerParameters, snapshotPrayerParameters } from './prayerParameters'

interface PrayerCastBase {
    targetId: string
    abilityId: PrayerActionId
    receiptId: string
    startedAt: number
    completesAt: number
    patron: GameCharacter['progression']['patron']
    mother?: MotherPrayerCastState
    plan?: MotherPrayerPlan
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
              walkWhileCasting?: boolean
              road?: RoadPrayerCastState
          }
    )
export interface RoadPrayerCastState {
    recoveryRadius: number
    usefulRecovery: number
    restoredTarget: boolean
    shoulder: boolean
}
export interface CharacterAbilityState {
    lastPrayerAbilityId: PrayerActionId | null
    prayerAurasSuppressed: boolean
    prayerSequence: number
    known: Set<AbilityId>
    availableAt: Partial<Record<AbilityId, number>>
    barrier: {
        expiresAt: number
        practiced: boolean
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
        prayerAurasSuppressed: false,
        prayerSequence: 0,
        known,
        availableAt: {},
        barrier: null,
        casting: null,
        untrainableHpDamage: 0,
    }
}
export function knowsAbility(actor: GameCharacter, id: AbilityId): boolean {
    return actor.abilities.known.has(id)
}
export function clearAbilityEffects(actor: GameCharacter): void {
    clearMagicChannel(actor)
    actor.abilities.barrier = null
    actor.abilities.casting = null
    actor.abilities.untrainableHpDamage = 0
}
export function snapshotAbilities(
    actor: GameCharacter,
    now: number
): CharacterAbilitiesSnapshot {
    const known = [...actor.abilities.known]
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
    if (known.includes('pray_woven')) {
        cooldowns.pray_woven = cooldowns.pray
    }
    for (const id of ['fireball', 'greater_fireball'] as const) {
        if (known.includes(id)) {
            cooldowns[id] = Math.max(
                0,
                actor.progression.spellAvailableAt - now
            )
        }
    }
    const magicChannel = snapshotMagicChannel(actor, now)
    const rootedUntil = magicRootedUntil(actor, now)
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
        ...(magicChannel === undefined ? {} : { magicChannel }),
        ...(rootedUntil <= now ? {} : { rootedUntil }),
        casting: snapshotCast(actor),
    }
}
function snapshotBarrier(
    actor: GameCharacter,
    now: number
): CharacterAbilitiesSnapshot['barrier'] {
    const barrier = activeBarrier(actor, now)
    return barrier === null ? null : { expiresAt: barrier.expiresAt }
}

export function activeBarrier(
    actor: GameCharacter,
    now: number
): CharacterAbilityState['barrier'] {
    const barrier = actor.abilities.barrier
    return actor.alive &&
        barrier !== null &&
        barrier.expiresAt > now &&
        actor.mana > 0
        ? barrier
        : null
}
function castAreaRadius(cast: PrayerCast): number {
    const recoveryRadius =
        cast.mode === 'prayer' ? cast.road?.recoveryRadius : undefined
    return (
        cast.plan?.radius ??
        recoveryRadius ??
        ABILITY_DEFINITIONS[cast.abilityId].range
    )
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
              radius: castAreaRadius(cast),
              ...(cast.mother?.lastLight === true
                  ? { uninterruptible: true }
                  : {}),
              ...(cast.mode === 'prayer' || cast.mode === 'purify_grave'
                  ? {
                        mode:
                            cast.intent.mode === 'devotion'
                                ? ('restore' as const)
                                : cast.intent.mode,
                        ...(cast.intent.mode === 'purify_grave'
                            ? { target: cast.intent.target }
                            : {}),
                        ...(cast.walkWhileCasting === true
                            ? { walkWhileCasting: true }
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
    const tainted = Math.min(
        actor.abilities.untrainableHpDamage,
        Math.max(0, missingBefore)
    )
    const untrainable = Math.min(tainted, Math.max(0, amount))
    actor.abilities.untrainableHpDamage = tainted - untrainable
    return Math.max(0, amount) - untrainable
}
