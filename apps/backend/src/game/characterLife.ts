import {
    type GameEventPayload,
    PRAYER_SCHOOL_DEFINITIONS,
    type PrayerAbilityId,
    profileForPrayer,
    REVIVE_MANA_COST,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { clearAbilityEffects, createAbilityState } from './abilityState'
import type { GameCharacter } from './character'
import { restoreCharacter } from './characterRecovery'
import { resolveMiracle } from './deities'
import { createCharacterConfig } from './heroClasses'
import { distance } from './math'
import { advancePrayerCast } from './prayer'
import { cancelPrayerCast } from './prayerCancellation'
import { revivalTargetEligible } from './prayerContext'
import { completePrayer } from './prayerEffects'
import { prayerParameters, setPrayerAvailableAt } from './prayerParameters'
import {
    canUseResurrection,
    createProgression,
    trainSkill,
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
    const roll = (random ?? context?.random ?? Math.random)()
    const outcome = resolveMiracle(caster, now, () => roll, cast.patron)
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
                { ...context, now },
                roll,
                outcome.quality,
                cast.receiptId,
                cast.abilityId
            ),
        ]
    }
    const school = PRAYER_SCHOOL_DEFINITIONS[cast.abilityId]
    const faithEvents = trainSkill(caster, school.faithSkillId)
    if (!outcome.success) {
        return [
            {
                actorId: caster.id,
                targetId: target.id,
                kind: 'notice',
                text: 'Божество не вернуло душу. Мана потрачена; можно повторить молитву, пока не истекло время.',
            },
            ...faithEvents,
        ]
    }
    restoreCharacter(target, now, false)
    return [
        { actorId: caster.id, targetId: target.id, kind: 'revive' },
        ...faithEvents,
        ...trainSkill(caster, school.miracleSkillId),
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
