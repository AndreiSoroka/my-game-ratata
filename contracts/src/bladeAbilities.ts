import type { AbilityDefinition } from './abilities'

export const bladeAbilityIds = [
    'wide_swing',
    'circular_swing',
    'lunge',
    'pommel_strike',
    'defensive_stance',
] as const
export type BladeAbilityId = (typeof bladeAbilityIds)[number]
export type BladeAttackAbilityId = Exclude<BladeAbilityId, 'defensive_stance'>
export function isBladeAbility(value: unknown): value is BladeAbilityId {
    return (
        typeof value === 'string' &&
        bladeAbilityIds.includes(value as BladeAbilityId)
    )
}
export function isBladeAttackAbility(
    value: unknown
): value is BladeAttackAbilityId {
    return isBladeAbility(value) && value !== 'defensive_stance'
}

export const bladeAbilityDefinitions: Record<
    BladeAbilityId,
    AbilityDefinition
> = {
    wide_swing: {
        name: 'Широкий размах',
        mana: 0,
        energy: 23,
        cooldownMs: 4000,
        range: 0,
        windupMs: 250,
        cycleMs: 650,
        movementMs: 450,
    },
    circular_swing: {
        name: 'Круговой размах',
        mana: 0,
        energy: 38,
        cooldownMs: 8000,
        range: 0,
        windupMs: 500,
        cycleMs: 900,
        movementMs: 800,
    },
    lunge: {
        name: 'Выпад',
        mana: 0,
        energy: 19,
        cooldownMs: 5000,
        range: 0,
        windupMs: 250,
        cycleMs: 600,
        movementMs: 400,
    },
    pommel_strike: {
        name: 'Удар эфесом',
        mana: 0,
        energy: 23,
        cooldownMs: 6000,
        range: 0,
        windupMs: 200,
        cycleMs: 550,
        movementMs: 400,
        stunMs: 400,
    },
    defensive_stance: {
        name: 'Глухая оборона',
        mana: 0,
        energy: 0,
        cooldownMs: 1000,
        range: 0,
        windupMs: 0,
    },
}
