export const constellationIds = [
    'blade',
    'magic',
    'prayer',
    'arrow',
    'life',
    'shadow',
] as const
export type ConstellationId = (typeof constellationIds)[number]

/** A numeric observation, never a disguised authoritative value. Upper range bounds are exclusive. */
export type ObservedValue =
    | { kind: 'exact'; value: number }
    | { kind: 'range'; lower: number; upper: number }

export interface ObservedResource {
    current: ObservedValue
    max: ObservedValue
    hasCapacity: boolean
}

export interface ObservedAttack {
    id: string
    name: string
    damage: { min: ObservedValue; max: ObservedValue }
    cooldownMs: ObservedValue
    critChance: ObservedValue
}

/** Private to the authorized observer of this identity. */
export interface CharacterSheetSnapshot {
    health: ObservedResource
    mana: ObservedResource
    energy: ObservedResource
    /** Current map cells per second, using the authoritative tile width. */
    moveSpeed: ObservedValue
    dodgeChance: ObservedValue
    attacks: ObservedAttack[]
}

export interface ConstellationPathSnapshot {
    id: ConstellationId
    name: string
    description: string
    color: string
    unlocked: boolean
}

export interface ConstellationNodeSnapshot {
    id: string
    constellationId: ConstellationId
    x: number
    y: number
    kind: 'root' | 'passive' | 'ability' | 'joint'
    unlocked: boolean
    /** Closed neighboring stars have neither a name nor an effect description. */
    name?: string
    description?: string
    parents: string[]
}

export interface ConstellationSnapshot {
    version: 1
    paths: ConstellationPathSnapshot[]
    nodes: ConstellationNodeSnapshot[]
    edges: Array<{ from: string; to: string }>
}
