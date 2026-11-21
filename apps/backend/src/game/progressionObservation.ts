import type { ProgressionSnapshot } from '@my-game-ratata/contracts'

/** Attained mastery levels are public; pending practice and earned perception are private. */
export function publicProgression(
    progression: ProgressionSnapshot
): ProgressionSnapshot {
    const description = { ...progression }
    const deity = { ...progression.deity }
    delete description.constellations
    delete description.otherDeities
    delete deity.hearthPrayerChances
    return {
        ...description,
        deity: {
            ...deity,
            omen: 'Знамения доступны только самому персонажу.',
            perception: 'vague',
            mood: null,
            successChance: null,
            changesInMs: null,
        },
        masteries: progression.masteries.map((mastery) => ({
            ...mastery,
            experience: '0',
            experienceToNext: '0',
            totalExperience: '0',
            pendingOpenings: 0,
            conflictMultiplier: 1,
        })),
    }
}
