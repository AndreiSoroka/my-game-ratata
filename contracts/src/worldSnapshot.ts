import type { AdventureSnapshot } from './adventure'
import type { ChestContainerSnapshot } from './chests'
import type { WorldGraveSnapshot } from './graves'
import type {
    CharacterSnapshot,
    Vector2,
    WorldChestSnapshot,
    WorldItemSnapshot,
} from './index'
import type { MagicEffectSnapshot, PortalEndpointSnapshot } from './magic'
import type { PartySnapshot } from './party'
import type { AutomationSnapshot } from './scenarios'
import type { SocialSnapshot } from './social'
import type { ViewportBounds } from './viewport'
import type { WorldLocation } from './world'

export interface HeardFootstepSnapshot {
    id: number
    position: Vector2
    expiresAt: number
}

/** Audio-only authorized sources; clients must not render or select these actors. */
export type FootstepSourceSnapshot = Pick<
    CharacterSnapshot,
    'id' | 'alive' | 'position' | 'velocity' | 'archetype' | 'movement'
>

export interface WorldSnapshot {
    /** Resolved simulation interval in milliseconds; zero disables motion continuation. */
    stepMs?: number
    /** Expanded server interest bounds. Missing spatial entries outside these are omitted, not removed. */
    viewBounds?: ViewportBounds
    footstepSources?: FootstepSourceSnapshot[]
    serverEpoch?: string
    social?: SocialSnapshot
    automation?: AutomationSnapshot
    graves?: WorldGraveSnapshot[]
    magicEffects?: MagicEffectSnapshot[]
    heardFootsteps?: HeardFootstepSnapshot[]
    portals?: PortalEndpointSnapshot[]
    chest?: ChestContainerSnapshot | null
    party?: PartySnapshot
    location?: WorldLocation
    adventure?: AdventureSnapshot
    chests: WorldChestSnapshot[]
    characters: CharacterSnapshot[]
    items: WorldItemSnapshot[]
    serverTime: number
    tick: number
}
