import type { ConstellationId } from '@my-game-ratata/contracts'

export interface CharacterConstellations {
    opened: Set<string>
    dormant: Set<string>
    credits: Record<ConstellationId, number>
    evidence: Record<string, number>
    receipts: Set<string>
    hostileWound: number
    woundPractice: number
    recoveryPractice: number
    lifeEnergy: {
        recovered: number
        workRemainder: number
        restUntil: number
        recentSpends: Array<{ at: number; energy: number }>
    }
    lowHpAwarded: boolean
    lowHpFromHostile: boolean
    lastSpellHit: { targetId: string; at: number } | null
    runicShotUntil: number
}

export function createConstellationState(): CharacterConstellations {
    return {
        opened: new Set(),
        dormant: new Set(),
        credits: {
            blade: 0,
            magic: 0,
            prayer: 0,
            arrow: 0,
            life: 0,
            shadow: 0,
            theft: 0,
            prayer_road: 0,
            prayer_lantern: 0,
            prayer_grave: 0,
            undead: 0,
        },
        evidence: {},
        receipts: new Set(),
        hostileWound: 0,
        woundPractice: 0,
        recoveryPractice: 0,
        lifeEnergy: {
            recovered: 0,
            workRemainder: 0,
            restUntil: 0,
            recentSpends: [],
        },
        lowHpAwarded: false,
        lowHpFromHostile: false,
        lastSpellHit: null,
        runicShotUntil: 0,
    }
}
