import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

import type { MusicId } from './soundCatalog'

export interface MusicProfile {
    exploration: MusicId | null
    battle: MusicId | null
}

type MusicOverride = Partial<MusicProfile> | null

const defaultMusic: MusicProfile = { exploration: 'forestExploration', battle: 'forestBattle' }
const dungeonMusic: MusicProfile = { ...defaultMusic, exploration: null }
const silence: MusicProfile = { exploration: null, battle: null }

// Missing fields inherit from the location's defaults. Use null for intentional silence.
const locationMusic: ReadonlyMap<string, MusicOverride> = new Map<string, MusicOverride>([
    [CENTER_LOCATION_ID, { exploration: 'adventureBegins' }],
])

export function resolveMusicProfile(
    locationId: string | undefined,
    underground: boolean,
    overrides: ReadonlyMap<string, MusicOverride> = locationMusic
): MusicProfile {
    if (locationId === undefined) return silence
    const defaults = underground ? dungeonMusic : defaultMusic
    const override = overrides.get(locationId)
    if (override === null) return silence
    if (override === undefined) return defaults
    const { exploration = defaults.exploration, battle = defaults.battle } = override
    return { exploration, battle }
}
