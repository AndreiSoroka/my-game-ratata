import type { CharacterSnapshot } from '@my-game-ratata/contracts'

import { characterFixture } from './characterFixture'

export const LONG_PLAYER_NAME = 'МихаилСорокаНовгородский'

export function playerStatusFixture(overrides: Partial<CharacterSnapshot> = {}): CharacterSnapshot {
    return characterFixture('status-hero', {
        nickname: 'Андрей Сорока',
        heroClass: 'cleric',
        hp: 26,
        maxHp: 26,
        resources: { mana: 120, maxMana: 120, energy: 100, maxEnergy: 100 },
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
