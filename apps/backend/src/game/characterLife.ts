import {
    type GameEventPayload,
    isMotherPrayer,
    PRAYER_SCHOOL_DEFINITIONS,
    type PrayerActionId,
    prayerSchoolId,
    profileForPrayer,
    REVIVE_MANA_COST,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import {
    clearAbilityEffects,
    createAbilityState,
    nextPrayerReceipt,
} from './abilityState'
import type { GameCharacter } from './character'
import { resolveMiracle } from './deities'
import { createCharacterConfig } from './heroClasses'
import { distance } from './math'
import { advancePrayerCast, beginPrayerCast } from './prayer'
import { cancelPrayerCast } from './prayerCancellation'
import {
    compatibleRevivalAllegiance,
    revivalTargetEligible,
} from './prayerContext'
import { completePrayer } from './prayerEffects'
import { prayerParameters, setPrayerAvailableAt } from './prayerParameters'
import { characterResurrectionParameters } from './resurrection'
import { completeReviveWithoutContext } from './resurrectionCompletion'
import { canUseResurrection, createProgression } from './skillProgression'

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
    abilityId: PrayerActionId = 'pray'
): boolean {
    context = authoritativeRevivalContext(caster, now, context)
    if (isMotherPrayer(abilityId) && context === undefined) {
        return false
    }
    if (
        caster.abilities.casting !== null ||
        caster.isActionLocked(now) ||
        !canRevive(caster, target, now, context, abilityId)
    ) {
        return false
    }
    if (context !== undefined && isMotherPrayer(abilityId)) {
        const events = beginPrayerCast(
            caster,
            { mode: 'revive', targetId: target.id },
            { ...context, now },
            abilityId
        )
        return events.some(
            (event) => event.kind === 'cast' && event.phase === 'started'
        )
    }
    const parameters = prayerParameters(
        caster,
        context?.navigation.grid.tileWidth,
        abilityId,
        'revive'
    )
    caster.abilities.casting = {
        abilityId,
        receiptId: nextPrayerReceipt(caster),
        completesAt: now + parameters.durationMs,
        startedAt: now,
        targetId: target.id,
        radius: parameters.radius,
        patron: PRAYER_SCHOOL_DEFINITIONS[prayerSchoolId(abilityId)].deityId,
    }
    caster.abilities.lastPrayerAbilityId = abilityId
    caster.lockAction(now, parameters.durationMs)
    caster.setAnimation('attack', now, parameters.durationMs)
    return true
}

export function advanceRevive(
    caster: GameCharacter,
    findTarget: (id: string) => GameCharacter | undefined,
    now: number,
    random?: () => number,
    context?: AbilityContext
): GameEventPayload[] {
    context = authoritativeRevivalContext(caster, now, context)
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
    if (!isMotherPrayer(cast.abilityId)) {
        caster.mana -= REVIVE_MANA_COST
    }
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

/** Compatibility callers reuse the room's authoritative geometry, never an invented map. */
function authoritativeRevivalContext(
    actor: GameCharacter,
    now: number,
    context?: AbilityContext
): AbilityContext | undefined {
    if (context !== undefined) {
        return { ...context, now }
    }
    const environment = actor.prayerAuraEnvironment
    const navigation = environment?.navigationFor(actor.locationId)
    return navigation === undefined || environment === undefined
        ? undefined
        : {
              navigation,
              now,
              characters: [...environment.characters()],
              sameParty: environment.sameParty,
          }
}

function canRevive(
    caster: GameCharacter,
    target: GameCharacter,
    now: number,
    context: AbilityContext | undefined,
    abilityId: PrayerActionId
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
        compatibleRevivalAllegiance(caster, target, now, abilityId) &&
        target.locationId === caster.locationId &&
        distance(caster.position, target.position) <=
            prayerParameters(
                caster,
                context?.navigation.grid.tileWidth,
                abilityId,
                'revive'
            ).radius
    )
}

function revivalCasterReady(
    caster: GameCharacter,
    now: number,
    abilityId: PrayerActionId
): boolean {
    return (
        canUseResurrection(caster, abilityId) &&
        caster.alive &&
        !caster.tags.has('offline') &&
        caster.stunUntil <= now &&
        caster.mana >= (isMotherPrayer(abilityId) ? 5 : REVIVE_MANA_COST)
    )
}
