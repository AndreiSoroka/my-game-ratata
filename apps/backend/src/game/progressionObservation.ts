import type { ProgressionSnapshot } from '@my-game-ratata/contracts'

/** Attained skill levels are public; pending practice and earned perception are private. */
export function publicProgression(
    progression: ProgressionSnapshot
): ProgressionSnapshot {
    const description = { ...progression }
    delete description.constellations
    delete description.otherDeities
    return {
        ...description,
        deity: {
            ...progression.deity,
            omen: 'Знамения доступны только самому персонажу.',
            perception: 'vague',
            mood: null,
            successChance: null,
            changesInMs: null,
        },
        skills: progression.skills.map((skill) => ({
            ...skill,
            practice: 0,
            practiceToNext: 0,
        })),
        practicedBranches: [],
        trainingMultiplier: 1,
    }
}
