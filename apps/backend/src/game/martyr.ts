import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { effectiveMaxMana } from './effectiveResources'
import { reconcileResourceCapacity } from './resourcePractice'

export interface MartyrState {
    cycles: number
    pendingHostileWound: boolean
    receipts: Set<string>
}
export interface MartyrPrayerOutcome {
    selfHealed: number
    otherMeaningful: boolean
    receiptId: string
    levelBefore: number
}

export function createMartyrState(): MartyrState {
    return { cycles: 0, pendingHostileWound: false, receipts: new Set() }
}

/** Incoming hits supply at most one opportunity for the next useful self-healing cycle. */
export function recordMartyrHostileDamage(
    actor: GameCharacter,
    amount: number,
    now: number
): void {
    if (
        eligible(actor) &&
        Number.isFinite(now) &&
        Number.isFinite(amount) &&
        amount > 0
    ) {
        actor.martyr.pendingHostileWound = true
    }
}

/** An actor's other meaningful action breaks the sequence; receipts still belong to this identity. */
export function resetMartyrStreak(actor: GameCharacter): void {
    actor.martyr.cycles = 0
    actor.martyr.pendingHostileWound = false
}

/** Natural or somebody else's recovery cannot leave a fully closed hostile wound available to reuse. */
export function recordMartyrRecovery(
    actor: GameCharacter,
    sourceId?: string
): void {
    if (
        sourceId !== actor.id &&
        actor.progression.constellations.hostileWound <= 0
    ) {
        actor.martyr.pendingHostileWound = false
    }
}

/** Resolve after the normal Mother's actual outcomes and before the action awards mastery XP. */
export function recordMartyrPrayer(
    actor: GameCharacter,
    outcome: MartyrPrayerOutcome,
    now: number
): GameEventPayload[] {
    if (!acceptPrayer(actor, outcome, now)) {
        return []
    }
    if (outcome.otherMeaningful) {
        resetMartyrStreak(actor)
        return []
    }
    if (
        !Number.isInteger(outcome.levelBefore) ||
        outcome.levelBefore < 0 ||
        outcome.levelBefore > 2
    ) {
        resetMartyrStreak(actor)
        return []
    }
    if (
        !Number.isFinite(outcome.selfHealed) ||
        outcome.selfHealed <= 0 ||
        !actor.martyr.pendingHostileWound
    ) {
        return []
    }
    actor.martyr.pendingHostileWound = false
    actor.martyr.cycles += 1
    if (actor.martyr.cycles < 5) {
        return []
    }
    unlockMartyr(actor)
    return []
}

function acceptPrayer(
    actor: GameCharacter,
    outcome: MartyrPrayerOutcome,
    now: number
): boolean {
    if (
        !eligible(actor) ||
        !Number.isFinite(now) ||
        outcome.receiptId.length === 0 ||
        actor.martyr.receipts.has(outcome.receiptId)
    ) {
        return false
    }
    actor.martyr.receipts.add(outcome.receiptId)
    return true
}

function eligible(actor: GameCharacter): boolean {
    return (
        actor.alive &&
        actor.trainingTarget === undefined &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired') &&
        actor.abilities.known.has('pray') &&
        actor.progression.constellations.opened.has('prayer.root') &&
        !actor.progression.constellations.opened.has('prayer.martyr')
    )
}

function unlockMartyr(actor: GameCharacter): void {
    const oldHp = actor.maxHp
    const oldMana = effectiveMaxMana(actor)
    actor.progression.constellations.opened.add('prayer.martyr')
    actor.hp = resizedPool(actor.hp, oldHp, actor.maxHp)
    actor.mana = resizedPool(actor.mana, oldMana, effectiveMaxMana(actor))
    const missingHp = Math.max(0, actor.maxHp - actor.hp)
    const state = actor.progression.constellations
    state.hostileWound = Math.min(state.hostileWound, missingHp)
    actor.abilities.untrainableHpDamage = Math.min(
        actor.abilities.untrainableHpDamage,
        missingHp
    )
    const ratio = oldHp > 0 ? actor.maxHp / oldHp : 0
    state.woundPractice *= ratio
    state.recoveryPractice *= ratio
    reconcileResourceCapacity(actor, 'mana')
}

function resizedPool(
    current: number,
    oldMaximum: number,
    newMaximum: number
): number {
    return Math.min(current, newMaximum) + Math.max(0, current - oldMaximum)
}
