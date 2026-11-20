import type { CharacterSnapshot } from '@my-game-ratata/contracts'

import { characterFixture } from './characterFixture'
import { masteriesFixture } from './masteryFixture'

export const LONG_PLAYER_NAME = 'МихаилСорокаНовгородский'

export function playerStatusFixture(overrides: Partial<CharacterSnapshot> = {}): CharacterSnapshot {
    return characterFixture('status-hero', {
        nickname: 'Андрей Сорока',
        heroClass: 'cleric',
        health: { kind: 'percent', percent: 100 },
        movement: { mode: 'walking', dashing: false, dashCooldownMsLeft: 0 },
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

/** Snapshot after the observer has earned an exact reading of the patron's mood. */
export function faithKnownStatusFixture(): CharacterSnapshot {
    return playerStatusFixture({
        abilities: { known: ['pray'], cooldowns: {}, casting: null, barrier: null },
        progression: {
            masteries: masteriesFixture({ prayer: 3 }),
            deity: {
                id: 'hearth',
                name: 'Угольная Мать',
                domain: 'Исцеление',
                omen: 'Тепло очага укрывает от холода.',
                perception: 'precise',
                mood: 'benevolent',
                successChance: null,
                changesInMs: null,
            },
            magicChaptersRead: 0,
            magicChaptersTotal: 3,
            resurrectionUnlocked: false,
        },
    })
}

/** The observer has only an earned omen; the exact mood is absent from the snapshot. */
export function faithUnknownMoodStatusFixture(): CharacterSnapshot {
    const character = faithKnownStatusFixture()
    character.progression!.deity = {
        ...character.progression!.deity,
        perception: 'hint',
        mood: null,
        omen: 'Тепло очага едва заметно. Пламя ждёт доброго дела.',
    }
    return character
}

/** Extended public consequences keep the HUD tall enough to test sibling overlay placement. */
export function wantedStatusFixture(): CharacterSnapshot {
    return {
        ...faithKnownStatusFixture(),
        theft: {
            cooldownMsLeft: 3_500,
            wantedMsLeft: 21_500,
            blacklisted: true,
            lastResult: null,
            accusations: [],
        },
    }
}
