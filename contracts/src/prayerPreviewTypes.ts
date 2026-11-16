import type { PrayerActionId, PrayerParametersSnapshot } from './abilities'
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
