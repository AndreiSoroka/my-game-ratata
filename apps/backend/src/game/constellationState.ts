import type { ConstellationId } from '@my-game-ratata/contracts'

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
            prayer_road: 0,
            prayer_lantern: 0,
            prayer_grave: 0,
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
