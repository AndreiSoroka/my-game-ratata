import {
    ARTISAN_STARS,
    constellationIds,
    formatMasteryExperience,
    MASTERY_NAMES,
    masteryThreshold,
    masteryTotalExperience,
    prayerAbilityIds,
    type ProgressionSnapshot,
    resolveResurrectionParameters,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { activeConstellationStars, hasStar } from './constellations'
import { snapshotConstellations } from './constellationSnapshot'
import { snapshotDeity, snapshotOtherDeities } from './deities'
import { readCachedConstellationLayout } from './personalConstellationSky'
import { prayerPurificationChance } from './prayerProbability'
import { canUseResurrection, captureMasteryFactors } from './skillProgression'

export function snapshotProgression(
    actor: GameCharacter,
    now: number,
    includePrivate = true
): ProgressionSnapshot {
    const factors = captureMasteryFactors(actor)
    const deity = snapshotDeity(actor, now)
    const resurrectionUnlocked = canUseResurrection(actor)
    if (
        includePrivate &&
        deity.id === 'hearth' &&
        deity.successChance !== null &&
        deity.mood !== null &&
        actor.abilities.known.has('pray')
    ) {
        deity.hearthPrayerChances = {
            purificationPerStep: prayerPurificationChance(deity.successChance),
            resurrection: resurrectionUnlocked
                ? resolveResurrectionParameters(
                      'pray',
                      activeConstellationStars(actor),
                      deity.mood
                  ).successChance
                : null,
        }
    }
    return {
        masteries: constellationIds
            .filter(
                (id) =>
                    (id !== 'fat_zombie' || actor.archetype === 'fat_zombie') &&
                    (id !== 'artisan' || hasStar(actor, ARTISAN_STARS.root))
            )
            .map((id) => {
                const mastery = actor.progression.masteries[id]
                return {
                    id,
                    name: MASTERY_NAMES[id],
                    level: mastery.level,
                    experience: formatMasteryExperience(mastery.experience),
                    experienceToNext: formatMasteryExperience(
                        masteryThreshold(mastery.level)
                    ),
                    totalExperience: formatMasteryExperience(
                        masteryTotalExperience(mastery.level) +
                            mastery.experience
                    ),
                    pendingOpenings:
                        actor.progression.constellations.credits[id],
                    conflictMultiplier: factors[id],
                }
            }),
        deity,
        ...(includePrivate
            ? {
                  otherDeities: snapshotOtherDeities(actor, now),
                  ...(readCachedConstellationLayout(actor) === undefined
                      ? {}
                      : { constellations: snapshotConstellations(actor) }),
              }
            : {}),
        magicChaptersRead: actor.progression.magicChaptersRead,
        magicChaptersTotal: 3,
        resurrectionUnlocked,
        resurrectionSchools: prayerAbilityIds.filter((id) =>
            canUseResurrection(actor, id)
        ),
    }
}

/** Public capabilities exclude theft practice, exact XP and earned perception. */
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
        masteries: progression.masteries
            .filter(({ id }) => id !== 'theft' && id !== 'fat_zombie')
            .map((mastery) => ({
                ...mastery,
                experience: '0',
                experienceToNext: '0',
                totalExperience: '0',
                pendingOpenings: 0,
                conflictMultiplier: 1,
            })),
    }
}
