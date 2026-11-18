import type { GameCharacter } from './character'
import { type AttackResourceSpend, spendResource } from './characterState'
import { effectiveAttackEnergyCost } from './effectiveParameters'

export function canSpendAttackResources(actor: GameCharacter): boolean {
    return (
        actor.energy >= effectiveAttackEnergyCost(actor) &&
        actor.mana >= actor.config.resources.attackManaCost
    )
}

export function spendAttackResources(
    actor: GameCharacter
): AttackResourceSpend {
    const resources = actor.config.resources
    const fullyPowered = canSpendAttackResources(actor)
    const canStun = fullyPowered
    actor.energy = spendResource(actor.energy, effectiveAttackEnergyCost(actor))
    actor.mana = spendResource(actor.mana, resources.attackManaCost)
    return { canStun, fullyPowered }
}

export function drainCharacterEnergy(
    actor: GameCharacter,
    amount: number
): number {
    if (amount <= 0) {
        return 0
    }
    const before = actor.energy
    actor.energy = Math.max(0, actor.energy - amount)
    return before - actor.energy
}
