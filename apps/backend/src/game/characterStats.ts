import type { CharacterStatsSnapshot } from '@my-game-ratata/contracts'
import { ITEM_DEFINITIONS } from '@my-game-ratata/contracts'

import type { CharacterConfig } from './characterConfig'
import type { EquipmentState } from './inventory'

export function resolveCharacterStats(
    config: CharacterConfig,
    equipment: EquipmentState,
    swordLevel = 1
): CharacterStatsSnapshot {
    const weapon = equipment.weapon
    const weaponStats =
        weapon === undefined
            ? undefined
            : ITEM_DEFINITIONS[weapon.itemId].weapon
    const swordBonus =
        weapon?.itemId === 'simple_sword' || weapon?.itemId === 'old_sword'
            ? Math.max(0, swordLevel - 1)
            : 0
    const damageMultiplier = config.combat.damageMultiplier ?? 1
    const dodgeBonus = Object.values(equipment).reduce(
        (total, item) =>
            total +
            (ITEM_DEFINITIONS[item.itemId].statBonuses?.dodgeChance ?? 0),
        0
    )

    return {
        attackCooldownMs: config.combat.attackCooldownMs,
        critChance: config.combat.critChance,
        dodgeChance: Math.max(
            0,
            Math.min(0.95, config.combat.dodgeChance + dodgeBonus)
        ),
        maxDamage:
            Math.ceil(
                (weaponStats?.maxDamage ?? config.combat.maxDamage) *
                    damageMultiplier
            ) + swordBonus,
        minDamage:
            Math.ceil(
                (weaponStats?.minDamage ?? config.combat.minDamage) *
                    damageMultiplier
            ) + swordBonus,
        moveSpeed: config.moveSpeed,
    }
}
