import {
    type CombatActionSnapshot,
    resolveCombatWeapon,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'

export interface CharacterCombatState {
    /** The only deadline for starting another attacking action. */
    readyAt: number
    sequence: number
    action?: CombatActionSnapshot
    defensiveStance: boolean
    stanceAvailableAt: number
    stanceController?: string
    movementFraction?: number
    slowMovementUntil?: number
    stunImmuneUntil: number
    combo?: {
        targetId: string
        weaponKey: string
        stacks: number
        expiresAt: number
    }
    lunge?: {
        direction: Vector2
        startedAt: number
        endsAt: number
        distance: number
        moved: number
    }
}
export function createCombatState(): CharacterCombatState {
    return {
        readyAt: 0,
        sequence: 0,
        defensiveStance: false,
        stanceAvailableAt: 0,
        stunImmuneUntil: 0,
    }
}
export function combatWeaponKey(actor: GameCharacter): string {
    return (
        actor.equipment.weapon?.instanceId ??
        `${actor.archetype}:natural-or-knife`
    )
}
export function leaveDefensiveStance(actor: GameCharacter, now: number): void {
    if (actor.combat.defensiveStance) {
        actor.combat.defensiveStance = false
        actor.combat.stanceAvailableAt = now + 1000
        actor.abilities.availableAt.defensive_stance = now + 1000
    }
}
/** Cancellation removes effects, never refunds time or already paid resources. */
export function clearCombatTransient(actor: GameCharacter, now: number): void {
    delete actor.combat.action
    delete actor.combat.combo
    delete actor.combat.lunge
    delete actor.combat.movementFraction
    delete actor.combat.slowMovementUntil
    leaveDefensiveStance(actor, now)
}
export function refreshCombatState(actor: GameCharacter, now: number): void {
    const state = actor.combat
    const weapon = resolveCombatWeapon(actor.archetype, actor.equipment.weapon)
    if (comboInvalid(actor, now, weapon.broken)) {
        delete state.combo
    }
    if (
        state.action !== undefined &&
        state.readyAt <= now &&
        actor.pendingAttack === undefined
    ) {
        delete state.action
        delete state.lunge
    }
    if (
        !actor.alive ||
        actor.stunUntil > now ||
        actor.tags.has('state.retired')
    ) {
        clearCombatTransient(actor, now)
    }
    if (
        state.defensiveStance &&
        (!weapon.bladeCompatible ||
            weapon.broken ||
            state.stanceController !== actor.soul.controlSource)
    ) {
        leaveDefensiveStance(actor, now)
    }
}
/** Equipment commands and breakage revoke contact, without resetting the paid deadline. */
export function invalidateWeaponAction(
    actor: GameCharacter,
    now: number
): void {
    actor.clearPendingAttackHit()
    actor.attackZones = []
    actor.attackZoneUntil = 0
    clearCombatTransient(actor, now)
}
export function nextCombatActionId(actor: GameCharacter): string {
    return `${actor.id}:attack:${String(++actor.combat.sequence)}`
}

function comboInvalid(
    actor: GameCharacter,
    now: number,
    broken: boolean
): boolean {
    const combo = actor.combat.combo
    return (
        combo !== undefined &&
        (combo.expiresAt <= now ||
            combo.weaponKey !== combatWeaponKey(actor) ||
            broken)
    )
}
