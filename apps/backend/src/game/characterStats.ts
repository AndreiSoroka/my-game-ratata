import type { CharacterStatsSnapshot } from '@my-game-ratata/contracts'
import { ITEM_DEFINITIONS } from '@my-game-ratata/contracts'

import type { CharacterConfig } from './characterConfig'
import type { EquipmentState } from './inventory'

export function resolveCharacterStats(
    config: CharacterConfig,
    equipment: EquipmentState
): CharacterStatsSnapshot {
    const weapon = equipment.weapon
    const weaponStats =
        weapon === undefined
            ? undefined
            : ITEM_DEFINITIONS[weapon.itemId].weapon
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
        maxDamage: weaponStats?.maxDamage ?? config.combat.maxDamage,
        minDamage: weaponStats?.minDamage ?? config.combat.minDamage,
        moveSpeed: config.moveSpeed,
    }
}
