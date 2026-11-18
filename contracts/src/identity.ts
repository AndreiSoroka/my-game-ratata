import type { CharacterArchetype } from './index'
import type { HeroClass } from './life'

export interface JoinClientMessage {
    /** Generated names must create a new identity, never reconnect an existing one. */
    createOnly?: boolean
    heroClass?: HeroClass
    archetype?: CharacterArchetype
    nickname: string
    type: 'join'
}

export interface PlayerIdentity {
    displayName: string
    id: string
}

export interface WorldPosition {
    x: number
    y: number
    z?: number
}
