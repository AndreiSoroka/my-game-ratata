import {
    backgroundMasteryRewardMicros,
    type ConstellationId,
    constellationIds,
    type DeityId,
    type GameEventPayload,
    isMotherPrayer,
    MASTERY_NAMES,
    masteryConflict,
    masteryThreshold,
    PRAYER_SCHOOL_DEFINITIONS,
    type PrayerActionId,
    prayerSchoolId,
    profileForPrayer,
    resolveCombatWeapon,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canWalkDuringPrayer } from './combatMovement'
import {
    createConstellationState,
    finishConstellationAction,
    reconcileConstellationLevels,
    syncAbilityConstellations,
} from './constellations'
import type { CharacterConstellations } from './constellationState'
import { activeMagicChannel, magicAttackWindingUp } from './magicState'

export {
    debitMasteryExperience,
    retainMasteryExperience,
    transferMasteryExperience,
} from './masteryLoss'

export interface MasteryPractice {
    level: number
    experience: bigint
    highestLevel?: number
}
export interface CharacterProgression {
    constellations: CharacterConstellations
    masteries: Record<ConstellationId, MasteryPractice>
    rewardReceipts: Set<string>
    patron: DeityId
    magicChaptersRead: number
    prayerAvailableAt: number
    spellAvailableAt: number
    ashManaGiftAvailableAt: number
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
        ashManaGiftAvailableAt: 0,
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
        ((isMotherPrayer(abilityId) && actor.heroClass === 'cleric') ||
            actor.progression.masteries[
                PRAYER_SCHOOL_DEFINITIONS[prayerSchoolId(abilityId)]
                    .constellationId
            ].level >= 5)
    )
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
interface ResolvedMasteryAward {
    id: ConstellationId
    micros: bigint
}
/** One validated action. Repeated targets of a branch share one frozen conflict factor. */
export function awardMasteries(
    actor: GameCharacter,
    awards: readonly MasteryAward[],
    options: MasteryAwardOptions
): GameEventPayload[] {
    if (!canReceiveMastery(actor, options.receiptId)) {
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
    return applyMasteryAwards(actor, resolved, options)
}

/** Resolved experience from sources such as inheritance, already denominated in micro-XP. */
export function awardMasteryExperience(
    actor: GameCharacter,
    id: ConstellationId,
    micros: bigint,
    options: MasteryAwardOptions
): GameEventPayload[] {
    if (micros <= 0n || !canReceiveMastery(actor, options.receiptId)) {
        return []
    }
    return applyMasteryAwards(actor, [{ id, micros }], options)
}

function applyMasteryAwards(
    actor: GameCharacter,
    awards: readonly ResolvedMasteryAward[],
    options: MasteryAwardOptions
): GameEventPayload[] {
    if (options.receiptId !== undefined) {
        actor.progression.rewardReceipts.add(options.receiptId)
    }
    const events = awards.flatMap(({ id, micros }) =>
        applyMasteryAward(actor, id, micros)
    )
    if (actor.progression.constellations.dormant.size > 0) {
        reconcileConstellationLevels(actor)
    } else {
        syncAbilityConstellations(actor)
    }
    return [
        ...events,
        ...finishConstellationAction(actor, {
            constellationIds: awards.map(({ id }) => id),
            now: options.now,
            random: options.random,
            actionId: options.receiptId,
            evidence: options.evidence,
        }),
    ]
}
export function canReceiveMastery(
    actor: GameCharacter,
    receiptId: string | undefined
): boolean {
    return (
        actor.alive &&
        actor.trainingTarget === undefined &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired') &&
        (receiptId === undefined ||
            !actor.progression.rewardReceipts.has(receiptId))
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
    const previousHighestLevel = Math.max(
        mastery.highestLevel ?? 0,
        mastery.level
    )
    mastery.experience += micros
    state.evidence[id] = (state.evidence[id] ?? 0) + 1
    if (id === 'blade' || id === 'life' || id === 'shadow') {
        state.opened.add(`${id}.root`)
    }
    const events: GameEventPayload[] = []
    while (mastery.experience >= masteryThreshold(mastery.level)) {
        mastery.experience -= masteryThreshold(mastery.level)
        mastery.level += 1
        if (mastery.level > previousHighestLevel) {
            state.credits[id] += 1
        }
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
interface SkillActionOptions {
    interruptWalkingPrayer?: boolean
    allowMagicChannel?: boolean
}

export function canPerformSkillAction(
    actor: GameCharacter,
    now: number,
    options?: SkillActionOptions
): boolean {
    return (
        actor.trainingTarget === undefined &&
        actor.alive &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired') &&
        actor.stunUntil <= now &&
        actor.combat.readyAt <= now &&
        !actor.combat.defensiveStance &&
        abilityAllowsAction(actor, now, options)
    )
}

function abilityAllowsAction(
    actor: GameCharacter,
    now: number,
    options?: SkillActionOptions
): boolean {
    return (
        !magicAttackWindingUp(actor) &&
        (options?.allowMagicChannel === true ||
            activeMagicChannel(actor, now) === undefined) &&
        ((actor.abilities.casting === null && !actor.isActionLocked(now)) ||
            (options?.interruptWalkingPrayer === true &&
                canWalkDuringPrayer(actor)))
    )
}
