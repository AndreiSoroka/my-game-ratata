import type { AttackZone, CharacterArchetype } from '@my-game-ratata/contracts'

export interface CharacterCombatStats {
    attackCooldownMs: number
    attackLockMs: number
    critChance: number
    critMultiplier: number
    maxDamage: number
    maxHp: number
    minDamage: number
    rangeScale: number
    stunChance: number
    stunMaxDurationMs: number
    stunMinDurationMs: number
}

export interface CharacterResourceStats {
    attackEnergyCost: number
    attackManaCost: number
    energyRegenIdle: number
    energyRegenMove: number
    manaRegenIdle: number
    manaRegenMove: number
    maxEnergy: number
    maxMana: number
}

export interface CharacterConfig {
    attackZones: Array<Omit<AttackZone, 'ownerId'>>
    combat: CharacterCombatStats
    hpRegenIdlePerSec: number
    hpRegenMovePerSec: number
    moveSpeed: number
    resources: CharacterResourceStats
}

export const CHARACTER_CONFIG: Record<CharacterArchetype, CharacterConfig> = {
    human: {
        attackZones: [{ minX: -1, minY: 0, maxX: 1, maxY: 0.9 }],
        combat: {
            attackCooldownMs: 400,
            attackLockMs: 450,
            critChance: 0.15,
            critMultiplier: 1.6,
            maxDamage: 9,
            maxHp: 30,
            minDamage: 5,
            rangeScale: 1,
            stunChance: 0.1,
            stunMaxDurationMs: 700,
            stunMinDurationMs: 300,
        },
        hpRegenIdlePerSec: 0.8,
        hpRegenMovePerSec: 0.35,
        moveSpeed: 90,
        resources: {
            attackEnergyCost: 15,
            attackManaCost: 0,
            energyRegenIdle: 6,
            energyRegenMove: 3,
            manaRegenIdle: 4,
            manaRegenMove: 2,
            maxEnergy: 100,
            maxMana: 40,
        },
    },
    skeleton: {
        attackZones: [{ minX: -1, minY: 0, maxX: 1, maxY: 1.2 }],
        combat: {
            attackCooldownMs: 500,
            attackLockMs: 400,
            critChance: 0.12,
            critMultiplier: 1.5,
            maxDamage: 8,
            maxHp: 26,
            minDamage: 4,
            rangeScale: 1.2,
            stunChance: 0.15,
            stunMaxDurationMs: 900,
            stunMinDurationMs: 400,
        },
        hpRegenIdlePerSec: 0.45,
        hpRegenMovePerSec: 0.18,
        moveSpeed: 82,
        resources: {
            attackEnergyCost: 12,
            attackManaCost: 0,
            energyRegenIdle: 5,
            energyRegenMove: 2,
            manaRegenIdle: 0,
            manaRegenMove: 0,
            maxEnergy: 60,
            maxMana: 0,
        },
    },
}

export function getCharacterConfig(
    archetype: CharacterArchetype
): CharacterConfig {
    return CHARACTER_CONFIG[archetype]
}
