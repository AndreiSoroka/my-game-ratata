import type { AbilityDefinition } from './abilities'

export const arrowAbilityIds = ['shot', 'sniper_shot'] as const
export type ArrowAbilityId = (typeof arrowAbilityIds)[number]

export function isArrowAbility(value: unknown): value is ArrowAbilityId {
    return value === 'shot' || value === 'sniper_shot'
}

export const arrowAbilityDefinitions = {
    shot: {
        name: 'Быстрый выстрел',
        mana: 0,
        energy: 10,
        cooldownMs: 550,
        range: 64,
        windupMs: 50,
        damage: 4,
        maxDamage: 7,
    },
    sniper_shot: {
        name: 'Снайперский выстрел',
        mana: 0,
        energy: 20,
        cooldownMs: 1800,
        cycleMs: 1800,
        range: 160,
        windupMs: 700,
        movementMs: 700,
        damage: 10,
        maxDamage: 15,
    },
} satisfies Record<ArrowAbilityId, AbilityDefinition>
