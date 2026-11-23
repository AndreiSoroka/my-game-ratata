import type { PrayerActionId, PrayerCostSnapshot } from './abilities'
import type { WorldGraveSnapshot } from './graves'
import type { CharacterSnapshot } from './index'
import type { DeityPrayerProfile } from './prayer'

export interface PrayerPreviewOptions {
    abilityId?: PrayerActionId
    canReach?: (target: CharacterSnapshot) => boolean
    canAid?: (target: CharacterSnapshot) => boolean
    graves?: readonly WorldGraveSnapshot[]
    canReachGrave?: (target: WorldGraveSnapshot) => boolean
}
export interface PreviewContext {
    player: CharacterSnapshot
    abilityId: PrayerActionId
    parameters: PrayerParametersSnapshot
    all: CharacterSnapshot[]
    profile: DeityPrayerProfile
    options: PrayerPreviewOptions
}

export interface PrayerParametersSnapshot {
    radius: number
    durationMs: number
    manaCost: number
    area: boolean
    harm: boolean
    targetLimit?: number
    wardRank?: number
    hasAuras?: boolean
    aurasSuppressed?: boolean
    energyRecoveryRadius?: number
    cost?: PrayerCostSnapshot
    ashRevival?: { radius: number; durationMs: number }
}
