export type CharacterRelationship = 'self' | 'friendly' | 'hostile'

export interface CharacterControlSnapshot {
    mode: 'none' | 'follow' | 'attack'
    targetId: string | null
}

export type CharacterControlCommand =
    | { type: 'auto_attack'; targetId: string | null }
    | { type: 'follow'; targetId: string | null }
    | { type: 'cancel_control' }
