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
import type { WorldLocation } from './world'

export interface HeardFootstepSnapshot {
    id: number
    position: Vector2
    expiresAt: number
}

export interface WorldSnapshot {
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
