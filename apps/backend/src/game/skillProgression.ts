import {
    backgroundMasteryRewardMicros,
    type ConstellationId,
    constellationIds,
    type DeityId,
    formatMasteryExperience,
    type GameEventPayload,
    MASTERY_NAMES,
    masteryConflict,
    masteryThreshold,
    masteryTotalExperience,
    PRAYER_SCHOOL_DEFINITIONS,
    prayerAbilityIds,
    type PrayerActionId,
    prayerSchoolId,
    profileForPrayer,
    type ProgressionSnapshot,
    resolveCombatWeapon,
    resolveResurrectionParameters,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canWalkDuringPrayer } from './combatMovement'
import {
    createConstellationState,
    finishConstellationAction,
    snapshotConstellations,
    syncAbilityConstellations,
} from './constellations'
import type { CharacterConstellations } from './constellationState'
import { snapshotDeity, snapshotOtherDeities } from './deities'
import { readCachedConstellationLayout } from './personalConstellationSky'
import { prayerPurificationChance } from './prayerProbability'

export interface MasteryPractice {
    level: number
    experience: bigint
}
export interface CharacterProgression {
    constellations: CharacterConstellations
    masteries: Record<ConstellationId, MasteryPractice>
    rewardReceipts: Set<string>
    patron: DeityId
    magicChaptersRead: number
    prayerAvailableAt: number
    spellAvailableAt: number
}
export function createProgression(): CharacterProgression {
    return {
        constellations: createConstellationState(),
        masteries: Object.fromEntries(
            constellationIds.map((id) => [id, { level: 0, experience: 0n }])
        ) as Record<ConstellationId, MasteryPractice>,
        rewardReceipts: new Set(),
        patron: 'hearth',
        magicChaptersRead: 0,
        prayerAvailableAt: 0,
        spellAvailableAt: 0,
    }
}
export function captureMasteryLevels(
    actor: GameCharacter
): Record<ConstellationId, number> {
    return Object.fromEntries(
        constellationIds.map((id) => [
            id,
            actor.progression.masteries[id].level,
        ])
    ) as Record<ConstellationId, number>
}
export function captureMasteryFactors(
    actor: GameCharacter
): Record<ConstellationId, number> {
    const levels = captureMasteryLevels(actor)
    return Object.fromEntries(
        constellationIds.map((id) => [id, masteryConflict(levels, id)])
    ) as Record<ConstellationId, number>
}
export function canUseResurrection(
    actor: GameCharacter,
    abilityId: PrayerActionId = 'pray'
): boolean {
    return (
        actor.abilities.known.has(abilityId) &&
        profileForPrayer(abilityId).reviveTypes.length > 0 &&
        (actor.heroClass === 'cleric' ||
            actor.progression.masteries[
                PRAYER_SCHOOL_DEFINITIONS[prayerSchoolId(abilityId)]
                    .constellationId
            ].level >= 5)
    )
}
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
                      actor.progression.constellations.opened,
                      deity.mood
                  ).successChance
                : null,
        }
    }
    return {
        masteries: constellationIds.map((id) => {
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
                    masteryTotalExperience(mastery.level) + mastery.experience
                ),
                pendingOpenings: actor.progression.constellations.credits[id],
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
export interface MasteryAward {
    constellationId: ConstellationId
    experience: number
}
export interface MasteryAwardOptions {
    now: number
    random?: (() => number) | undefined
    receiptId?: string | undefined
    evidence?: string[] | undefined
    factors?: Readonly<Record<ConstellationId, number>> | undefined
}
/** One validated action. Repeated targets of a branch share one frozen conflict factor. */
export function awardMasteries(
    actor: GameCharacter,
    awards: readonly MasteryAward[],
    options: MasteryAwardOptions
): GameEventPayload[] {
    if (
        !canReceiveMastery(actor) ||
        (options.receiptId !== undefined &&
            actor.progression.rewardReceipts.has(options.receiptId))
    ) {
        return []
    }
    const sums = sumMasteryAwards(awards)
    if (sums.size === 0) {
        return []
    }
    const factors = options.factors ?? captureMasteryFactors(actor)
    const resolved = [...sums].map(([id, amount]) => ({
        id,
        micros: backgroundMasteryRewardMicros(
            amount,
            factors[id],
            actor.heroClass,
            id
        ),
    }))
    if (options.receiptId !== undefined) {
        actor.progression.rewardReceipts.add(options.receiptId)
    }
    const events = resolved.flatMap(({ id, micros }) =>
        applyMasteryAward(actor, id, micros)
    )
    syncAbilityConstellations(actor)
    return [
        ...events,
        ...finishConstellationAction(actor, {
            constellationIds: [...sums.keys()],
            now: options.now,
            random: options.random,
            actionId: options.receiptId,
            evidence: options.evidence,
        }),
    ]
}
function canReceiveMastery(actor: GameCharacter): boolean {
    return (
        actor.alive &&
        actor.trainingTarget === undefined &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired')
    )
}
function sumMasteryAwards(
    awards: readonly MasteryAward[]
): Map<ConstellationId, number> {
    const sums = new Map<ConstellationId, number>()
    for (const award of awards) {
        if (
            !constellationIds.includes(award.constellationId) ||
            !Number.isFinite(award.experience) ||
            award.experience <= 0
        ) {
            continue
        }
        sums.set(
            award.constellationId,
            (sums.get(award.constellationId) ?? 0) + award.experience
        )
    }
    return sums
}
function applyMasteryAward(
    actor: GameCharacter,
    id: ConstellationId,
    micros: bigint
): GameEventPayload[] {
    const state = actor.progression.constellations
    const mastery = actor.progression.masteries[id]
    mastery.experience += micros
    state.evidence[id] = (state.evidence[id] ?? 0) + 1
    if (id === 'blade' || id === 'life' || id === 'shadow') {
        state.opened.add(`${id}.root`)
    }
    const events: GameEventPayload[] = []
    while (mastery.experience >= masteryThreshold(mastery.level)) {
        mastery.experience -= masteryThreshold(mastery.level)
        mastery.level += 1
        state.credits[id] += 1
        events.push({
            actorId: actor.id,
            kind: 'skill_up',
            amount: mastery.level,
            text: `${MASTERY_NAMES[id]}: уровень ${String(mastery.level)}`,
        })
    }
    return events
}
export function hasEquippedSword(actor: GameCharacter): boolean {
    const weapon = resolveCombatWeapon(actor.archetype, actor.equipment.weapon)
    return weapon.bladeCompatible && !weapon.broken
}
export function canPerformSkillAction(
    actor: GameCharacter,
    now: number,
    options?: { interruptWalkingPrayer: boolean }
): boolean {
    return (
        actor.trainingTarget === undefined &&
        actor.alive &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired') &&
        actor.stunUntil <= now &&
        actor.combat.readyAt <= now &&
        !actor.combat.defensiveStance &&
        ((actor.abilities.casting === null && !actor.isActionLocked(now)) ||
            (options?.interruptWalkingPrayer === true &&
                canWalkDuringPrayer(actor)))
    )
}
