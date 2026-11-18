import type { CharacterStatsSnapshot } from '@my-game-ratata/contracts'
import {
    isItemBroken,
    ITEM_DEFINITIONS,
    resolveCombatWeapon,
} from '@my-game-ratata/contracts'

import type { CharacterConfig } from './characterConfig'
import type { EquipmentState } from './inventory'

export function resolveCharacterStats(
    config: CharacterConfig,
    equipment: EquipmentState
): CharacterStatsSnapshot {
    const weaponStats = resolveCombatWeapon(
        config.archetype ?? 'skeleton',
        physicalWeapon(config, equipment)
    )
    const damageMultiplier = config.combat.damageMultiplier ?? 1
    const dodgeBonus = Object.values(equipment).reduce(
        (total, item) =>
            total +
            (isItemBroken(item)
                ? 0
                : (ITEM_DEFINITIONS[item.itemId].statBonuses?.dodgeChance ??
                  0)),
        0
    )

    return {
        attackCooldownMs: config.combat.attackCooldownMs,
        critChance: config.combat.critChance,
        dodgeChance: Math.max(
            0,
            Math.min(0.95, config.combat.dodgeChance + dodgeBonus)
        ),
        maxDamage: Math.ceil(
            (weaponStats.maxDamage ?? config.combat.maxDamage) *
                damageMultiplier
        ),
        minDamage: Math.ceil(
            (weaponStats.minDamage ?? config.combat.minDamage) *
                damageMultiplier
        ),
        moveSpeed: config.moveSpeed,
    }
}

function physicalWeapon(config: CharacterConfig, equipment: EquipmentState) {
    const item = equipment.weapon
    return config.basicAttackKind === 'melee' && item !== undefined
        ? item
        : undefined
}
