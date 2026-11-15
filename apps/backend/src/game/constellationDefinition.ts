import type {
    AbilityId,
    ConstellationId,
    ConstellationNodeSnapshot,
} from '@my-game-ratata/contracts'

import { constellationPosition } from './constellationLayout'

export interface ConstellationStar {
    id: string
    constellationId: ConstellationId
    name: string
    description: string
    parents: string[]
    evidence: string[]
    kind: NonNullable<ConstellationNodeSnapshot['kind']>
    effectType: 'active' | 'passive'
    effects?: string[]
    ability?: AbilityId
    x: number
    y: number
}

export function star(
    path: ConstellationId,
    suffix: string,
    name: string,
    description: string,
    parents: string[] = ['root'],
    evidence: string[] = [],
    ability?: AbilityId
): ConstellationStar {
    return {
        id: `${path}.${suffix}`,
        constellationId: path,
        name,
        description,
        parents: parents.map((id) => (id.includes('.') ? id : `${path}.${id}`)),
        evidence,
        kind: 'passive',
        effectType: 'passive',
        ...(ability === undefined ? {} : { ability }),
        ...constellationPosition(`${path}.${suffix}`, path),
    }
}
