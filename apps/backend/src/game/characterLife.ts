import {
    type GameEventPayload,
    MASTERY_REWARDS,
    PRAYER_SCHOOL_DEFINITIONS,
    type PrayerAbilityId,
    profileForPrayer,
    type ResurrectionParameters,
    REVIVE_MANA_COST,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import {
    clearAbilityEffects,
    createAbilityState,
    type PrayerCast,
} from './abilityState'
import type { GameCharacter } from './character'
import { resolveMiracle } from './deities'
import { createCharacterConfig } from './heroClasses'
import { distance } from './math'
import { advancePrayerCast } from './prayer'
import { cancelPrayerCast } from './prayerCancellation'
import { revivalTargetEligible } from './prayerContext'
import { completePrayer } from './prayerEffects'
import { applyPrayerGift } from './prayerGifts'
import { prayerParameters, setPrayerAvailableAt } from './prayerParameters'
import { characterResurrectionParameters } from './resurrection'
import {
    awardMasteries,
    canUseResurrection,
    captureMasteryFactors,
    createProgression,
} from './skillProgression'

export function shouldRetireCharacter(
    character: GameCharacter,
    now: number
): boolean {
    return (
        character.mortal &&
        !character.alive &&
        !character.tags.has('state.retired') &&
        character.reviveUntil > 0 &&
        now >= character.reviveUntil
    )
}

export function canAbandonLife(character: GameCharacter): boolean {
    return (
        character.controllerKind === 'network_player' &&
        character.mortal &&
        !character.alive &&
        character.reviveUntil > 0 &&
        !character.tags.has('state.retired') &&
        !character.tags.has('offline')
    )
}

export function retireCharacter(character: GameCharacter): GameEventPayload {
    character.inventory = []
    character.equipment = {}
    character.xp = 0
    character.level = 1
    character.progression = createProgression()
    Object.assign(
        character.config,
        createCharacterConfig(character.archetype, character.heroClass)
    )
    character.maxHp = character.config.combat.maxHp
    character.tags.add('state.retired')
    character.clearPath()
    character.clearPendingAttackHit()
    clearAbilityEffects(character)
    character.abilities.known = createAbilityState(
        character.heroClass,
        character.archetype
    ).known
    character.abilities.availableAt = {}
    return { actorId: character.id, kind: 'permadeath' }
}

export function beginRevive(
    caster: GameCharacter,
    target: GameCharacter,
    now: number,
    context?: AbilityContext,
    abilityId: PrayerAbilityId = 'pray'
): boolean {
    if (
        caster.abilities.casting !== null ||
        caster.isActionLocked(now) ||
        !canRevive(caster, target, now, context, abilityId)
    ) {
        return false
    }
    caster.abilities.casting = {
        abilityId,
        receiptId: `${caster.id}:prayer:${String(++caster.abilities.prayerSequence)}`,
        completesAt:
            now +
            prayerParameters(
                caster,
                context?.navigation.grid.tileWidth,
                abilityId
            ).durationMs,
        startedAt: now,
        targetId: target.id,
        patron: PRAYER_SCHOOL_DEFINITIONS[abilityId].deityId,
    }
    caster.abilities.lastPrayerAbilityId = abilityId
    caster.lockAction(
        now,
        prayerParameters(caster, context?.navigation.grid.tileWidth, abilityId)
            .durationMs
    )
    caster.setAnimation(
        'attack',
        now,
        prayerParameters(caster, context?.navigation.grid.tileWidth, abilityId)
            .durationMs
    )
    return true
}

export function advanceRevive(
    caster: GameCharacter,
    findTarget: (id: string) => GameCharacter | undefined,
    now: number,
    random?: () => number,
    context?: AbilityContext
): GameEventPayload[] {
    const cast = caster.abilities.casting
    if (cast === null) {
        return []
    }
    if ('intent' in cast) {
        return advancePrayerCast(caster, now, context, random)
    }
    const target = findTarget(cast.targetId)
    if (
        target === undefined ||
        !canRevive(caster, target, now, context, cast.abilityId)
    ) {
        return cancelPrayerCast(caster, now)
    }
    if (now < cast.completesAt) {
        return []
    }
    caster.abilities.casting = null
    caster.mana -= REVIVE_MANA_COST
    const randomSource = random ?? context?.random ?? Math.random
    const roll = randomSource()
    const resurrection = characterResurrectionParameters(
        caster,
        cast.abilityId,
        now
    )
    const outcome = {
        ...resolveMiracle(caster, now, () => roll, cast.patron),
        success: roll < resurrection.successChance,
    }
    setPrayerAvailableAt(caster, cast.abilityId, now)
    if (context !== undefined) {
        return [
            {
                kind: 'cast',
                actorId: caster.id,
                targetId: target.id,
                abilityId: cast.abilityId,
                phase: 'completed',
            },
            ...completePrayer(
                caster,
                { mode: 'revive', targetId: target.id },
                { ...context, now, random: randomSource },
                roll,
                outcome.quality,
                cast.receiptId,
                cast.abilityId
            ),
        ]
    }
    return completeReviveWithoutContext(
        caster,
        target,
        cast,
        now,
        outcome,
        resurrection,
        randomSource
    )
}

function completeReviveWithoutContext(
    caster: GameCharacter,
    target: GameCharacter,
    cast: Pick<PrayerCast, 'abilityId' | 'receiptId'>,
    now: number,
    outcome: ReturnType<typeof resolveMiracle>,
    resurrection: ResurrectionParameters,
    random?: () => number
): GameEventPayload[] {
    if (!outcome.success) {
        return [
            {
                actorId: caster.id,
                targetId: target.id,
                kind: 'notice',
                text: 'Божество не вернуло душу. Мана потрачена; можно повторить молитву, пока не истекло время.',
            },
        ]
    }
    const factors = captureMasteryFactors(caster)
    const lowHpGift =
        caster.hp < caster.maxHp * 0.2 &&
        caster.progression.constellations.hostileWound > 0 &&
        caster.progression.constellations.lowHpFromHostile
    const gift = applyPrayerGift(
        caster,
        target,
        { mode: 'revive', targetId: target.id },
        now,
        outcome.quality,
        cast.abilityId,
        undefined,
        resurrection,
        random
    )
    return [
        ...gift.events,
        ...awardMasteries(
            caster,
            gift.meaningful
                ? [
                      {
                          constellationId:
                              PRAYER_SCHOOL_DEFINITIONS[cast.abilityId]
                                  .constellationId,
                          experience: MASTERY_REWARDS.resurrection,
                      },
                  ]
                : [],
            {
                now,
                random,
                receiptId: cast.receiptId,
                factors,
                evidence:
                    gift.meaningful && cast.abilityId === 'pray'
                        ? [
                              'prayer',
                              'gift',
                              ...(lowHpGift ? ['low_hp_gift'] : []),
                          ]
                        : [],
            }
        ),
    ]
}

function canRevive(
    caster: GameCharacter,
    target: GameCharacter,
    now: number,
    context: AbilityContext | undefined,
    abilityId: PrayerAbilityId
): boolean {
    return (
        (context === undefined ||
            revivalTargetEligible(caster, target, context, abilityId)) &&
        revivalCasterReady(caster, now, abilityId) &&
        !target.tags.has('offline') &&
        profileForPrayer(abilityId).reviveTypes.includes(target.creatureType) &&
        !target.alive &&
        !target.tags.has('state.retired') &&
        target.reviveUntil > now &&
        target.faction === caster.faction &&
        target.locationId === caster.locationId &&
        distance(caster.position, target.position) <=
            prayerParameters(
                caster,
                context?.navigation.grid.tileWidth,
                abilityId
            ).radius
    )
}

function revivalCasterReady(
    caster: GameCharacter,
    now: number,
    abilityId: PrayerAbilityId
): boolean {
    return (
        canUseResurrection(caster, abilityId) &&
        caster.alive &&
        !caster.tags.has('offline') &&
        caster.stunUntil <= now &&
        caster.mana >= REVIVE_MANA_COST
    )
}
