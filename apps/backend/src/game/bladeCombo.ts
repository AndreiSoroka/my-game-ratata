import { resolveCombatWeapon } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { PendingAttackHit } from './characterState'
import { combatWeaponKey } from './combatState'
import { constellationModifiers } from './constellationModifiers'

export function comboEligible(attack: PendingAttackHit): boolean {
    return (
        attack.underpowered !== true &&
        attack.abilityId !== 'wide_swing' &&
        attack.abilityId !== 'circular_swing' &&
        (attack.abilityId === undefined ||
            attack.abilityId === 'lunge' ||
            attack.abilityId === 'pommel_strike')
    )
}
export function prepareComboTarget(
    actor: GameCharacter,
    targetId?: string
): void {
    if (targetId !== undefined && actor.combat.combo?.targetId !== targetId) {
        delete actor.combat.combo
    }
}
export function bladeComboBonus(
    actor: GameCharacter,
    targetId: string,
    now: number
): number {
    prepareComboTarget(actor, targetId)
    const combo = actor.combat.combo
    if (
        combo === undefined ||
        combo.expiresAt <= now ||
        combo.weaponKey !== combatWeaponKey(actor)
    ) {
        delete actor.combat.combo
        return 0
    }
    return (
        Math.min(combo.stacks, constellationModifiers(actor).bladeComboLimit) *
        0.1
    )
}
export function advanceBladeCombo(
    actor: GameCharacter,
    target: GameCharacter,
    attack: PendingAttackHit,
    now: number
): void {
    const weapon = resolveCombatWeapon(actor.archetype, actor.equipment.weapon)
    const limit = constellationModifiers(actor).bladeComboLimit
    if (
        !comboEligible(attack) ||
        !weapon.bladeCompatible ||
        weapon.broken ||
        limit === 0 ||
        target.trainingTarget !== undefined
    ) {
        return
    }
    const previous = bladeComboBonus(actor, target.id, now) / 0.1
    actor.combat.combo = {
        targetId: target.id,
        weaponKey: combatWeaponKey(actor),
        stacks: Math.min(limit, Math.round(previous) + 1),
        expiresAt: now + 3000,
    }
}
