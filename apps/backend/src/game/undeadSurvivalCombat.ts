import type { DamageKind, GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { invalidateWeaponAction } from './combatState'
import { effectiveMaxEnergy } from './effectiveResources'
import { zeroVector } from './math'
import { restoreEnergy, spendUsefulEnergy } from './resourcePractice'
import {
    readUndeadSurvivalLife,
    undeadSurvivalLife,
} from './undeadSurvivalState'

export function graveLoanDamageMultiplier(
    target: GameCharacter,
    kind: DamageKind,
    now: number
): number {
    return kind === 'physical' &&
        (readUndeadSurvivalLife(target)?.loanUntil ?? 0) > now
        ? 1.1
        : 1
}

export function guardUndeadHp(
    target: GameCharacter,
    attacker: GameCharacter,
    amount: number,
    kind: DamageKind,
    now: number
): number {
    const stars = target.progression.constellations.opened
    if (
        kind === 'holy' ||
        kind === 'unholy' ||
        (!stars.has('undead.delayed_decay') && !stars.has('undead.collapse'))
    ) {
        return amount
    }
    const remaining = interceptUndeadDamage(target, attacker, amount, now)
    return remaining >= target.hp && canCollapse(target, now)
        ? target.hp - 1
        : remaining
}

function interceptUndeadDamage(
    target: GameCharacter,
    attacker: GameCharacter,
    amount: number,
    now: number
): number {
    const stars = target.progression.constellations.opened
    if (!stars.has('undead.delayed_decay') || amount <= target.maxHp * 0.2) {
        return amount
    }
    const life = undeadSurvivalLife(target)
    if (now < life.interceptionReadyAt) {
        return amount
    }
    const heldPain = stars.has('undead.held_pain')
    const diverted = Math.min(
        heldPain ? 12 : 8,
        Math.floor(amount - target.maxHp * 0.2),
        Math.floor(target.energy / 2)
    )
    if (diverted <= 0) {
        return amount
    }
    spendUsefulEnergy(target, 2 * diverted)
    life.interceptionReadyAt = now + 6000
    if (heldPain) {
        life.heldPain = { attackerId: attacker.id, expiresAt: now + 4000 }
    }
    return amount - diverted
}

function canCollapse(target: GameCharacter, now: number): boolean {
    if (!target.progression.constellations.opened.has('undead.collapse')) {
        return false
    }
    const life = undeadSurvivalLife(target)
    const cost = life.collapses === 0 ? 60 : 90
    if (
        target.hp <= 1 ||
        target.energy < cost ||
        (life.collapses !== 0 && !life.secondCollapseReady)
    ) {
        return false
    }
    spendUsefulEnergy(target, cost)
    life.collapses += 1
    life.collapseLockUntil = now + 1000
    life.secondCollapseReady = false
    invalidateWeaponAction(target, now)
    target.clearPath()
    target.setMoveInput(zeroVector())
    return true
}

export function consumeHeldPain(
    actor: GameCharacter,
    target: GameCharacter,
    now: number
): GameEventPayload[] {
    const life = readUndeadSurvivalLife(actor)
    if (
        life?.heldPain?.attackerId !== target.id ||
        life.heldPain.expiresAt <= now
    ) {
        return []
    }
    delete life.heldPain
    return restoreEnergy(actor, 8, now).events
}

export function finishUndeadWound(
    target: GameCharacter,
    hpDamage: number,
    now: number
): GameEventPayload[] {
    const lockUntil = readUndeadSurvivalLife(target)?.collapseLockUntil ?? 0
    if (lockUntil > now) {
        target.lockAction(now, lockUntil - now)
    }
    return receiveGraveLoan(target, hpDamage, now)
}

function receiveGraveLoan(
    target: GameCharacter,
    hpDamage: number,
    now: number
): GameEventPayload[] {
    if (
        !target.alive ||
        !target.progression.constellations.opened.has('undead.grave_loan') ||
        hpDamage < target.maxHp * 0.1 ||
        target.energy >= effectiveMaxEnergy(target) * 0.25
    ) {
        return []
    }
    const life = undeadSurvivalLife(target)
    if (now < life.loanReadyAt) {
        return []
    }
    life.loanReadyAt = now + 8000
    life.loanUntil = now + 2000
    return restoreEnergy(target, 18, now).events
}
