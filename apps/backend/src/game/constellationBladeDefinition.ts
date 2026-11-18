import type { AbilityId } from '@my-game-ratata/contracts'

import { type ConstellationStar, star } from './constellationDefinition'

export function bladeStar(
    suffix: string,
    name: string,
    description: string,
    results: string[],
    parents: string[] = ['root'],
    activationAbilityId?: AbilityId
): ConstellationStar {
    return {
        ...star(
            'blade',
            suffix,
            name,
            description,
            parents,
            bladeEvidence(suffix)
        ),
        results,
        ...(activationAbilityId === undefined
            ? {}
            : { kind: 'ability', effectType: 'active', activationAbilityId }),
    }
}

function bladeEvidence(suffix: string): string[] {
    if (
        [
            'dodge',
            'dodge2',
            'resolve',
            'resolve2',
            'defensive_stance',
            'guard_strong',
            'arrow_deflect',
        ].includes(suffix)
    ) {
        return ['wound']
    }
    return suffix.startsWith('damage') ||
        suffix.startsWith('stun') ||
        [
            'wide_swing',
            'circular_swing',
            'lunge',
            'pommel_strike',
            'counterattack',
        ].includes(suffix)
        ? ['swordsmanship']
        : []
}
