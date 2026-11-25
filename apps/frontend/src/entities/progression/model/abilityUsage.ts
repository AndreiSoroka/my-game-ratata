import {
    ABILITY_DEFINITIONS,
    type AbilityId,
    type AbilityUsageSnapshot,
    type CharacterSnapshot,
} from '@my-game-ratata/contracts'

/** Costs and geometry are server observations; damage knowledge stays in the character sheet. */
export function abilityUsage(
    player: Pick<CharacterSnapshot, 'abilities'>,
    id: AbilityId
): AbilityUsageSnapshot {
    const observed = player.abilities?.parameters?.[id]
    if (observed !== undefined) return observed
    const definition = ABILITY_DEFINITIONS[id]
    return {
        mana: definition.mana,
        energy: definition.energy,
        cooldownMs: definition.cooldownMs,
        range: definition.range,
        windupMs: definition.windupMs,
    }
}
