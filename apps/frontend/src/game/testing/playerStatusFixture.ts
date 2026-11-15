import type { CharacterSnapshot } from '@my-game-ratata/contracts'

import { characterFixture } from './characterFixture'

export const LONG_PLAYER_NAME = 'МихаилСорокаНовгородский'

export function playerStatusFixture(overrides: Partial<CharacterSnapshot> = {}): CharacterSnapshot {
    return characterFixture('status-hero', {
        nickname: 'Андрей Сорока',
        heroClass: 'cleric',
        health: { kind: 'percent', percent: 100 },
        resources: {
            mana: { kind: 'percent', percent: 100, hasCapacity: true },
            energy: { kind: 'percent', percent: 100, hasCapacity: true },
        },
        soul: {
            kind: 'spark',
            controlSource: 'human',
            canSpeak: true,
            personality: 'Любознательный',
            companion: null,
        },
        ...overrides,
    })
}
