import type { ConstellationId, SkillId } from '@my-game-ratata/contracts'

export interface CharacterConstellations {
    opened: Set<string>
    credits: Record<ConstellationId, number>
    evidence: Record<string, number>
    receipts: Set<string>
    hostileWound: number
    woundPractice: number
    recoveryPractice: number
    lowHpAwarded: boolean
    lowHpFromHostile: boolean
    lastSpellHit: { targetId: string; at: number } | null
    runicShotUntil: number
}

export const skillConstellations: Record<SkillId, ConstellationId> = {
    swordsmanship: 'blade',
    arcana: 'magic',
    fireball: 'magic',
    greater_fireball: 'magic',
    faith: 'prayer',
    miracles: 'prayer',
    marksmanship: 'arrow',
    vitality: 'life',
    stealth: 'shadow',
    theft: 'shadow',
}

export function createConstellationState(): CharacterConstellations {
    return {
        opened: new Set(),
        credits: {
            blade: 0,
            magic: 0,
            prayer: 0,
            arrow: 0,
            life: 0,
            shadow: 0,
        },
        evidence: {},
        receipts: new Set(),
        hostileWound: 0,
        woundPractice: 0,
        recoveryPractice: 0,
        lowHpAwarded: false,
        lowHpFromHostile: false,
        lastSpellHit: null,
        runicShotUntil: 0,
    }
}
