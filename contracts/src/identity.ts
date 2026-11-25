import type { CharacterArchetype } from './index'
import type { HeroClass } from './life'
import type { GameLocale } from './locales'

export interface JoinClientMessage {
    /** Generated names must create a new identity, never reconnect an existing one. */
    createOnly?: boolean
    heroClass?: HeroClass
    locale?: GameLocale
    archetype?: CharacterArchetype
    nickname: string
    requestResumeToken?: boolean
    resumeToken?: string
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

export function isPlayerResumeToken(value: unknown): value is string {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(value)
}
