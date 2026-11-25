import { CENTER_LOCATION_ID, worldLocationId } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { type MusicProfile, resolveMusicProfile } from './musicProfiles'

const forest = worldLocationId(1, 1)
const dungeon = 'dungeon-small'

it('selects surface, city and dungeon defaults', () => {
    expect(resolveMusicProfile(forest, false)).toEqual({
        exploration: 'forestExploration',
        battle: 'forestBattle',
    })
    expect(resolveMusicProfile(CENTER_LOCATION_ID, false)).toEqual({
        exploration: 'adventureBegins',
        battle: 'forestBattle',
    })
    expect(resolveMusicProfile(dungeon, true)).toEqual({
        exploration: null,
        battle: 'forestBattle',
    })
})

it('inherits omitted fields and preserves explicit silence in either field or the entire profile', () => {
    const overrides = new Map<string, Partial<MusicProfile> | null>([
        [forest, { battle: null }],
        [dungeon, { battle: 'adventureBegins' }],
        [CENTER_LOCATION_ID, null],
    ])
    expect(resolveMusicProfile(forest, false, overrides)).toEqual({
        exploration: 'forestExploration',
        battle: null,
    })
    expect(resolveMusicProfile(dungeon, true, overrides)).toEqual({
        exploration: null,
        battle: 'adventureBegins',
    })
    expect(resolveMusicProfile(CENTER_LOCATION_ID, false, overrides)).toEqual({
        exploration: null,
        battle: null,
    })
})
