import type { CharacterArchetype } from './index'
import { isItemBroken, ITEM_DEFINITIONS, type ItemCondition } from './inventory'

/** One ordinary human strike, before earned constellation modifiers. */
export const HUMAN_MELEE_RULES = {
    cycleMs: 450,
    hitMs: 50,
    movementMs: 450,
    energy: 15,
    critChance: 0.15,
    critMultiplier: 1.6,
    dodgeChance: 0.05,
    stunChance: 0.01,
    stunMs: 500,
    targetEnergyDrain: 8,
    stunImmunityMs: 2000,
} as const
export const BACKUP_KNIFE = {
    name: 'Удар ножом',
    description:
        'Когда другое оружие не выбрано, вы пользуетесь походным ножом. Такой нож есть у каждого героя.',
    minDamage: 2,
    maxDamage: 4,
} as const
export interface CombatWeapon {
    kind: 'knife' | 'sword' | 'axe' | 'other' | 'natural'
    name: string
    description?: string
    minDamage?: number
    maxDamage?: number
    bladeCompatible: boolean
    broken: boolean
}
/** Identity and equipment, never a controller or starting background, determine the weapon. */
export function resolveCombatWeapon(
    archetype: CharacterArchetype,
    weapon?: ItemCondition
): CombatWeapon {
    if (weapon === undefined) {
        return archetype === 'human'
            ? {
                  ...BACKUP_KNIFE,
                  kind: 'knife',
                  bladeCompatible: true,
                  broken: false,
              }
            : {
                  kind: 'natural',
                  name: 'Обычный удар',
                  bladeCompatible: false,
                  broken: false,
              }
    }
    const sword =
        weapon.itemId === 'old_sword' || weapon.itemId === 'simple_sword'
    const axe = weapon.itemId === 'axe' || weapon.itemId === 'stone_axe'
    const definition = ITEM_DEFINITIONS[weapon.itemId]
    return {
        kind: sword ? 'sword' : axe ? 'axe' : 'other',
        name: sword ? 'Удар мечом' : axe ? 'Удар топором' : 'Удар оружием',
        ...definition.weapon,
        bladeCompatible: sword,
        broken: isItemBroken(weapon),
    }
}
