import type { AdventureSnapshot } from './adventure'
import type { ChestContainerSnapshot } from './chests'
import type { WorldGraveSnapshot } from './graves'
import type {
    CharacterSnapshot,
    WorldChestSnapshot,
    WorldItemSnapshot,
} from './index'
import type { MagicEffectSnapshot, PortalEndpointSnapshot } from './magic'
import type { PartySnapshot } from './party'
import type { AutomationSnapshot } from './scenarios'
import type { SocialSnapshot } from './social'
import type { WorldLocation } from './world'

export interface WorldSnapshot {
    serverEpoch?: string
    social?: SocialSnapshot
    automation?: AutomationSnapshot
    graves?: WorldGraveSnapshot[]
    magicEffects?: MagicEffectSnapshot[]
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
