import {
    type AttackZone,
    type BasicAttackKind,
    type CharacterArchetype,
    HUMAN_BASE_RESOURCES,
    HUMAN_MELEE_RULES,
} from '@my-game-ratata/contracts'

export interface CharacterCombatStats {
    damageMultiplier?: number
    attackCooldownMs: number
    attackLockMs: number
    attackWindupMs: number
    critChance: number
    critMultiplier: number
    dodgeChance: number
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
    archetype?: CharacterArchetype
    basicAttackKind: BasicAttackKind
    attackZones: Array<Omit<AttackZone, 'ownerId'>>
    combat: CharacterCombatStats
    hpRegenIdlePerSec: number
    hpRegenMovePerSec: number
    moveSpeed: number
    resources: CharacterResourceStats
}

export const CHARACTER_CONFIG: Record<CharacterArchetype, CharacterConfig> = {
    human: {
        archetype: 'human',
        basicAttackKind: 'melee',
        attackZones: [{ minX: -1, minY: 0, maxX: 1, maxY: 0.9 }],
        combat: {
            attackCooldownMs: HUMAN_MELEE_RULES.cycleMs,
            attackLockMs: HUMAN_MELEE_RULES.movementMs,
            attackWindupMs: HUMAN_MELEE_RULES.hitMs,
            critChance: HUMAN_MELEE_RULES.critChance,
            critMultiplier: HUMAN_MELEE_RULES.critMultiplier,
            dodgeChance: HUMAN_MELEE_RULES.dodgeChance,
            maxDamage: 4,
            maxHp: HUMAN_BASE_RESOURCES.health,
            minDamage: 2,
            rangeScale: 1,
            stunChance: HUMAN_MELEE_RULES.stunChance,
            stunMaxDurationMs: HUMAN_MELEE_RULES.stunMs,
            stunMinDurationMs: HUMAN_MELEE_RULES.stunMs,
        },
        hpRegenIdlePerSec: 0.8,
        hpRegenMovePerSec: 0.35,
        moveSpeed: 90,
        resources: {
            attackEnergyCost: HUMAN_MELEE_RULES.energy,
            attackManaCost: 0,
            energyRegenIdle: 6,
            energyRegenMove: 3,
            manaRegenIdle: 4,
            manaRegenMove: 2,
            maxEnergy: HUMAN_BASE_RESOURCES.energy,
            maxMana: HUMAN_BASE_RESOURCES.mana,
        },
    },
    skeleton: {
        archetype: 'skeleton',
        basicAttackKind: 'melee',
        attackZones: [{ minX: -1, minY: 0, maxX: 1, maxY: 1.2 }],
        combat: {
            attackCooldownMs: 500,
            attackLockMs: 400,
            attackWindupMs: 220,
            critChance: 0.12,
            critMultiplier: 1.5,
            dodgeChance: 0.02,
            maxDamage: 8,
            maxHp: 20,
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
            maxEnergy: 225,
            maxMana: 0,
        },
    },
    slime: {
        archetype: 'slime',
        basicAttackKind: 'melee',
        attackZones: [{ minX: -1, minY: 0, maxX: 1, maxY: 1.2 }],
        combat: {
            attackCooldownMs: 2000,
            attackLockMs: 400,
            attackWindupMs: 220,
            critChance: 0.12,
            critMultiplier: 1.5,
            dodgeChance: 0,
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
