import {
    type AttackDelivery,
    type GameEventPayload,
    livingCreatureTypes,
} from '@my-game-ratata/contracts'

import { consumeHealingProvenance } from './abilityState'
import type { GameCharacter } from './character'
import type { PendingAttackHit } from './characterState'
import { invalidateWeaponAction } from './combatState'
import { effectiveMaxEnergy } from './effectiveResources'
import { canTargetByFaction } from './factions'
import { recordMartyrRecovery } from './martyr'
import { restoreEnergy } from './resourcePractice'
import {
    consumeUndeadRetaliation,
    rememberUndeadAttacker,
    type RetaliationEffect,
    undeadRetaliationFocus,
} from './undeadRetaliation'
import { consumeHeldPain } from './undeadSurvivalCombat'
import { recordVitalityRecovery } from './vitalityPractice'

const HEAL_WINDOW_MS = 10_000
const HEAL_WINDOW_LIMIT = 12
const HEAL_PER_CONTACT = 3

function isHostileContact(
    actor: GameCharacter,
    target: GameCharacter,
    now: number
): boolean {
    return (
        actor.alive &&
        target.alive &&
        actor.locationId === target.locationId &&
        actor.trainingTarget === undefined &&
        target.trainingTarget === undefined &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired') &&
        !target.tags.has('offline') &&
        !target.tags.has('state.retired') &&
        actor.faction !== target.faction &&
        canTargetByFaction(actor, target, now)
    )
}

function healthyBone(actor: GameCharacter): boolean {
    return (
        actor.progression.constellations.opened.has('undead.dense_bone') &&
        actor.hp >= actor.maxHp * 0.7
    )
}

function crackedBone(actor: GameCharacter): boolean {
    return (
        actor.progression.constellations.opened.has('undead.cracked') &&
        actor.hp <= actor.maxHp * 0.35
    )
}

export function undeadPhysicalDefense(
    actor: GameCharacter,
    target: GameCharacter,
    delivery: AttackDelivery,
    now: number
): number {
    if (
        delivery === 'magic' ||
        !target.progression.constellations.opened.has('undead.root') ||
        !isHostileContact(actor, target, now)
    ) {
        return 1
    }
    if (delivery === 'melee_physical' && healthyBone(target)) {
        return 0.88
    }
    return crackedBone(target) ? 1.1 : 1
}

export function boneStrikeWindupBonus(actor: GameCharacter): number {
    const stars = actor.progression.constellations.opened
    if (!stars.has('undead.bone_windup')) {
        return 0
    }
    return stars.has('undead.feint') ? 80 : 200
}

export function boneStrikePower(actor: GameCharacter): number {
    return actor.progression.constellations.opened.has('undead.bone_windup')
        ? 1.3
        : 1
}

/** Keep the paid action and ability deadlines when a vulnerable windup is interrupted. */
export function interruptUndeadWindup(actor: GameCharacter, now: number): void {
    const pending = actor.pendingAttack
    if (
        pending?.abilityId === 'skeleton_strike' &&
        now < pending.hitAt &&
        boneStrikeWindupBonus(actor) > 0
    ) {
        invalidateWeaponAction(actor, now)
        actor.setAnimation('idle', now)
    }
}

export function boneStrikeGuardDrain(
    actor: GameCharacter,
    target: GameCharacter,
    attack: PendingAttackHit,
    now: number
): number {
    return attack.abilityId === 'skeleton_strike' &&
        actor.progression.constellations.opened.has('undead.shatter_guard') &&
        isHostileContact(actor, target, now)
        ? 8
        : 0
}

export function boneStrikeStunBonus(
    actor: GameCharacter,
    target: GameCharacter,
    now: number
): number {
    return actor.progression.constellations.opened.has('undead.dull_ring') &&
        target.energy <= effectiveMaxEnergy(target) * 0.25 &&
        isHostileContact(actor, target, now)
        ? 200
        : 0
}

export function prepareUndeadCombatContact(
    actor: GameCharacter,
    target: GameCharacter,
    attack: PendingAttackHit,
    delivery: AttackDelivery,
    now: number
) {
    const stars = actor.progression.constellations.opened
    const targetStars = target.progression.constellations.opened
    if (
        delivery === 'magic' ||
        (!stars.has('undead.root') && !targetStars.has('undead.root')) ||
        !isHostileContact(actor, target, now)
    ) {
        return undefined
    }
    return {
        retaliationToPrime: retaliationEffect(target, delivery),
        ...undeadOffense(actor, target, attack, delivery, now),
    }
}

function undeadOffense(
    actor: GameCharacter,
    target: GameCharacter,
    attack: PendingAttackHit,
    delivery: AttackDelivery,
    now: number
) {
    const melee = delivery === 'melee_physical'
    const boneStrike = attack.abilityId === 'skeleton_strike'
    const retaliation = melee
        ? undeadRetaliationFocus(actor, target, now)
        : undefined
    return {
        retaliation,
        damageMultiplier:
            (boneStrike ? boneStrikePower(actor) : 1) +
            (melee && crackedBone(actor) ? 0.15 : 0) +
            (boneStrike ? boneRecoveryDamage(actor, target, now) : 0) +
            (retaliation?.damageBonus ?? 0),
        critBonus: melee ? boneCritBonus(actor) : 0,
        heals: melee && canRestoreFracturedBone(actor),
        drawsMarrow: boneStrike && canDrawMarrow(actor, target),
    }
}

function canRestoreFracturedBone(actor: GameCharacter): boolean {
    return (
        actor.progression.constellations.opened.has('undead.nothing_to_lose') &&
        actor.hp <= actor.maxHp * 0.25
    )
}

function canDrawMarrow(actor: GameCharacter, target: GameCharacter): boolean {
    return (
        actor.progression.constellations.opened.has('undead.marrow_draw') &&
        livingCreatureTypes.includes(target.creatureType)
    )
}

function boneCritBonus(actor: GameCharacter): number {
    return actor.progression.constellations.opened.has(
        'undead.splinter_edge'
    ) && actor.hp <= actor.maxHp * 0.3
        ? 0.08
        : 0
}

function boneRecoveryDamage(
    actor: GameCharacter,
    target: GameCharacter,
    now: number
): number {
    const action = target.combat.action
    return actor.progression.constellations.opened.has(
        'undead.read_recovery'
    ) &&
        action !== undefined &&
        target.pendingAttack === undefined &&
        now >= action.hitAt &&
        now < action.readyAt
        ? 0.25
        : 0
}

function retaliationEffect(
    defender: GameCharacter,
    delivery: AttackDelivery
): RetaliationEffect | undefined {
    const stars = defender.progression.constellations.opened
    if (
        delivery === 'melee_physical' &&
        stars.has('undead.splinters') &&
        healthyBone(defender)
    ) {
        return stars.has('undead.anvil')
            ? { damageBonus: 0.18, durationMs: 7_000 }
            : { damageBonus: 0.1, durationMs: 4_000 }
    }
    return delivery === 'ranged_physical' && stars.has('undead.grudge')
        ? { damageBonus: 0.12, durationMs: 6_000 }
        : undefined
}

/** Called only on authoritative hostile HP contact. */
export function finishUndeadCombatContact(
    actor: GameCharacter,
    target: GameCharacter,
    attack: PendingAttackHit,
    contact: ReturnType<typeof prepareUndeadCombatContact>,
    now: number
): GameEventPayload[] {
    if (contact === undefined || !actor.alive) {
        return []
    }
    consumeUndeadRetaliation(actor, contact.retaliation)
    if (contact.retaliationToPrime !== undefined && target.alive) {
        rememberUndeadAttacker(target, actor, contact.retaliationToPrime, now)
    }
    return [
        ...(contact.heals ? restoreFracturedBone(actor, attack, now) : []),
        ...(contact.drawsMarrow ? restoreEnergy(actor, 4, now).events : []),
        ...(attack.abilityId === 'skeleton_strike'
            ? consumeHeldPain(actor, target, now)
            : []),
    ]
}

interface BoneRecovery {
    deathSequence: number
    lastActionId?: string
    heals: Array<{ at: number; amount: number }>
}

const boneRecovery = new WeakMap<GameCharacter, BoneRecovery>()

function restoreFracturedBone(
    actor: GameCharacter,
    attack: PendingAttackHit,
    now: number
): GameEventPayload[] {
    const state = recoveryState(actor)
    if (
        attack.actionId !== undefined &&
        attack.actionId === state.lastActionId
    ) {
        return []
    }
    state.heals = state.heals.filter(({ at }) => at > now - HEAL_WINDOW_MS)
    const used = state.heals.reduce((sum, { amount }) => sum + amount, 0)
    const missing = actor.maxHp - actor.hp
    const amount = Math.min(HEAL_PER_CONTACT, HEAL_WINDOW_LIMIT - used, missing)
    if (amount <= 0) {
        return []
    }
    if (attack.actionId !== undefined) {
        state.lastActionId = attack.actionId
    }
    state.heals.push({ at: now, amount })
    consumeHealingProvenance(actor, amount, missing)
    actor.hp += amount
    recordMartyrRecovery(actor, actor.id)
    return [
        {
            kind: 'heal',
            actorId: actor.id,
            targetId: actor.id,
            amount,
            text: 'hp',
        },
        ...recordVitalityRecovery(actor, amount, now, true),
    ]
}

function recoveryState(actor: GameCharacter): BoneRecovery {
    const existing = boneRecovery.get(actor)
    if (existing?.deathSequence === actor.deathSequence) {
        return existing
    }
    const state = { deathSequence: actor.deathSequence, heals: [] }
    boneRecovery.set(actor, state)
    return state
}
