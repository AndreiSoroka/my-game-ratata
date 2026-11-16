import type { Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance } from './math'
export {
    bindPrayerAuraEnvironment,
    ensurePrayerAuraEnvironment,
    type PrayerAuraEnvironment,
} from './prayerAuraEnvironment'

/** Frozen at channel start; the owner keeps the full execution plan separately. */
export interface MotherPrayerAuraState {
    radius: number
    wardRank: number
    wardTargetIds: readonly string[]
    protection: boolean
    blessing: boolean
    domain: boolean
    absolute: boolean
    lastLight: boolean
    concentrationChance: number
    aurasEnabled: boolean
}

export interface PrayerAuraEffects {
    minimumDamage: boolean
    slowMultiplier: number
    feared: boolean
    dodgeBonus: number
    advantage: boolean
    damageTakenMultiplier: number
}

function personalChannelState(
    actor: GameCharacter,
    now: number
): MotherPrayerAuraState | undefined {
    const cast = actor.abilities.casting
    return actor.alive &&
        (!actor.tags.has('offline') || cast?.mother?.lastLight === true) &&
        !actor.tags.has('state.retired') &&
        cast !== null &&
        now >= cast.startedAt
        ? cast.mother
        : undefined
}

function channelState(
    actor: GameCharacter,
    now: number
): MotherPrayerAuraState | undefined {
    const cast = actor.abilities.casting
    if (
        cast === null ||
        (now >= cast.completesAt && cast.plan?.resolving !== true)
    ) {
        return undefined
    }
    return personalChannelState(actor, now)
}

export function activePrayerAuras(
    source: GameCharacter,
    now: number
): MotherPrayerAuraState | undefined {
    const state = channelState(source, now)
    return state?.aurasEnabled === true &&
        (source.stunUntil <= now || state.absolute || state.lastLight)
        ? state
        : undefined
}

function covers(
    source: GameCharacter,
    target: GameCharacter,
    state: MotherPrayerAuraState,
    position: Vector2 = target.position
): boolean {
    const navigation = (
        source.prayerAuraEnvironment ?? target.prayerAuraEnvironment
    )?.navigationFor(source.locationId)
    return (
        auraTargetAvailable(source, target, state) &&
        source.locationId === target.locationId &&
        distance(source.position, position) <= state.radius &&
        (source.id === target.id ||
            (navigation?.hasLineOfSight(source.position, position) ?? true))
    )
}

function auraTargetAvailable(
    source: GameCharacter,
    target: GameCharacter,
    state: MotherPrayerAuraState
): boolean {
    return (
        target.alive &&
        !target.tags.has('state.retired') &&
        (!target.tags.has('offline') ||
            (target.id === source.id && state.lastLight))
    )
}

export function prayerAuraEffects(
    target: GameCharacter,
    now: number
): PrayerAuraEffects {
    const result: PrayerAuraEffects = {
        minimumDamage: false,
        slowMultiplier: 1,
        feared: false,
        dodgeBonus: 0,
        advantage: false,
        damageTakenMultiplier: 1,
    }
    const environment = target.prayerAuraEnvironment
    for (const source of environment?.characters() ?? [target]) {
        const state = activePrayerAuras(source, now)
        if (state === undefined || !covers(source, target, state)) {
            continue
        }
        applyWardAura(result, target, state)
        applyPublicAuras(result, source, target, state)
    }
    return result
}

function applyWardAura(
    result: PrayerAuraEffects,
    target: GameCharacter,
    state: MotherPrayerAuraState
): void {
    if (
        target.creatureType !== 'undead' ||
        !state.wardTargetIds.includes(target.id)
    ) {
        return
    }
    result.minimumDamage ||= state.wardRank >= 1
    if (state.wardRank >= 2) {
        result.slowMultiplier = 0.1
    }
    result.feared ||= state.wardRank >= 4
}

function applyPublicAuras(
    result: PrayerAuraEffects,
    source: GameCharacter,
    target: GameCharacter,
    state: MotherPrayerAuraState
): void {
    if (
        state.protection &&
        target.creatureType !== 'undead' &&
        target.creatureType !== 'construct'
    ) {
        result.dodgeBonus = 0.1
    }
    if (
        state.blessing &&
        source.id !== target.id &&
        target.prayerAuraEnvironment?.sameParty(source.id, target.id) === true
    ) {
        result.advantage = true
    }
    if (state.domain && target.creatureType === 'undead') {
        result.damageTakenMultiplier = 1.5
    }
}

export function hasPrayerAdvantage(actor: GameCharacter, now: number): boolean {
    return prayerAuraEffects(actor, now).advantage
}

/** A sample can be reused for every threshold belonging to one correlated action. */
export function prayerCheckSample(
    random: () => number,
    advantage: boolean
): number {
    const first = random()
    return advantage ? Math.min(first, random()) : first
}

export function rollCharacterCheck(
    actor: GameCharacter,
    chance: number,
    random: () => number,
    now: number,
    advantage = hasPrayerAdvantage(actor, now)
): boolean {
    return prayerCheckSample(random, advantage) < chance
}

/** Damage resistance does not include movement, death, or the ordinary stun rule. */
export function prayerDamageInterrupts(
    target: GameCharacter,
    now: number,
    random: () => number = Math.random,
    advantage = hasPrayerAdvantage(target, now)
): boolean {
    const state = personalChannelState(target, now)
    if (state === undefined) {
        return true
    }
    if (state.absolute || state.lastLight) {
        return false
    }
    return (
        state.concentrationChance <= 0 ||
        !rollCharacterCheck(
            target,
            state.concentrationChance,
            random,
            now,
            advantage
        )
    )
}

export function prayerStunImmune(target: GameCharacter, now: number): boolean {
    return personalChannelState(target, now)?.absolute === true
}

export function canPerceivePrayerCaster(
    observer: GameCharacter,
    target: GameCharacter,
    now: number
): boolean {
    const state = activePrayerAuras(target, now)
    return !(
        observer.id !== target.id &&
        observer.creatureType === 'undead' &&
        state !== undefined &&
        state.wardRank >= 3 &&
        state.wardTargetIds.includes(observer.id) &&
        covers(target, observer, state)
    )
}

export function prayerFearSources(
    target: GameCharacter,
    now: number
): GameCharacter[] {
    if (target.creatureType !== 'undead') {
        return []
    }
    return [...(target.prayerAuraEnvironment?.characters() ?? [target])].filter(
        (source) => {
            const state = activePrayerAuras(source, now)
            return (
                state !== undefined &&
                state.wardRank >= 4 &&
                state.wardTargetIds.includes(target.id) &&
                source.locationId === target.locationId
            )
        }
    )
}

export function insidePrayerFear(
    source: GameCharacter,
    target: GameCharacter,
    now: number,
    position: Vector2 = target.position
): boolean {
    const state = activePrayerAuras(source, now)
    return state !== undefined && covers(source, target, state, position)
}
