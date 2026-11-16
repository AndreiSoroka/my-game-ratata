import {
    type ConstellationId,
    constellationIds,
    createMasteryLevels,
    formatMasteryExperience,
    MASTERY_NAMES,
    masteryConflict,
    type MasterySnapshot,
    masteryThreshold,
    masteryTotalExperience,
} from '@my-game-ratata/contracts'

export function masteriesFixture(
    overrides: Partial<Record<ConstellationId, number>> = {}
): MasterySnapshot[] {
    const levels = { ...createMasteryLevels(), ...overrides }
    return constellationIds.map((id) => ({
        id,
        name: MASTERY_NAMES[id],
        level: levels[id],
        experience: '0',
        experienceToNext: formatMasteryExperience(masteryThreshold(levels[id])),
        totalExperience: formatMasteryExperience(masteryTotalExperience(levels[id])),
        pendingOpenings: 0,
        conflictMultiplier: masteryConflict(levels, id),
    }))
}
