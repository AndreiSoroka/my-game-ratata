import type {
    CharacterInteractions,
    CharacterRelationship,
    CharacterSnapshot,
    PrayerAuraEffectId,
} from '@my-game-ratata/contracts'

import { snapshotAshExhaustion } from './ashExhaustion'
import { isTameableAshSkeleton } from './ashTaming'
import type { GameCharacter } from './character'
import {
    type CombatObserver,
    observeCharacterCombat,
} from './combatObservation'
import { hasAttackRelationship } from './combatTargets'
import { roadPrayerDashRemainingMs } from './effectiveParameters'
import { recruitableNpc } from './npcRoster'
import { hasDeclaredHostility } from './personalHostility'
import { prayerAuraEffects } from './prayerAuras'
import { hasRoadPrayerRecovery } from './roadPrayerRecovery'
import type { SnapshotContext } from './roomSnapshot'
import { canHearSpeech } from './socialSpeech'

export function projectRoomCharacter(
    context: SnapshotContext,
    character: CharacterSnapshot,
    view: CombatObserver,
    playerId?: string
): CharacterSnapshot {
    const actor = context.characters.get(character.id)
    const activity = observedWorkerActivity(context, actor, view, playerId)
    const auraEffects = observedPrayerAuraEffects(actor, playerId, view)
    const interactions = interactionsFor(context, actor, view.observer?.id)
    const observed = observeCharacterCombat(character, actor, view)
    const dashDiscountMsLeft =
        actor !== undefined && actor.id === playerId
            ? roadPrayerDashRemainingMs(actor, view.now)
            : 0
    delete observed.prayerAuraEffects
    delete observed.ashExhaustion
    delete observed.ashTameable
    return {
        ...observed,
        ...(interactions === undefined ? {} : { interactions }),
        ...observedAshEffects(actor, playerId, view),
        ...(activity === undefined ? {} : { workerActivity: activity }),
        ...(auraEffects.length === 0 ? {} : { prayerAuraEffects: auraEffects }),
        ...(dashDiscountMsLeft > 0 && observed.movement !== undefined
            ? {
                  movement: {
                      ...observed.movement,
                      roadPrayerDashDiscountMsLeft: dashDiscountMsLeft,
                  },
              }
            : {}),
        ...projectRelationship(view.observer, actor, playerId, view.now),
        control:
            character.id === playerId
                ? (character.control ?? { mode: 'none', targetId: null })
                : { mode: 'none', targetId: null },
        inventory: character.id === playerId ? character.inventory : [],
        theft: context.theft.snapshot(character.id, playerId, view.now, actor),
    }
}

function observedAshEffects(
    actor: GameCharacter | undefined,
    playerId: string | undefined,
    { observer, navigation, now }: CombatObserver
): Pick<CharacterSnapshot, 'ashExhaustion' | 'ashTameable'> {
    if (actor === undefined || observer === undefined) {
        return {}
    }
    if (actor === observer && actor.id === playerId) {
        const ashExhaustion = snapshotAshExhaustion(actor, now)
        return ashExhaustion === undefined ? {} : { ashExhaustion }
    }
    return isTameableAshSkeleton(observer, actor) &&
        navigation?.hasLineOfSight(observer.position, actor.position) === true
        ? { ashTameable: true }
        : {}
}

function interactionsFor(
    context: SnapshotContext,
    actor: GameCharacter | undefined,
    viewerId: string | undefined
): CharacterInteractions | undefined {
    if (context.social === undefined || actor === undefined) {
        return undefined
    }
    const interactions: CharacterInteractions =
        context.social.interactions(actor)
    const companion = actor.soul.companion
    if (
        viewerId !== undefined &&
        companion !== null &&
        interactions.aiDialogue &&
        recruitableNpc(actor.id)
    ) {
        interactions.companionCanFight = companion.canFight
        interactions.companionRequests =
            companion.leaderId === null
                ? 'available'
                : companion.leaderId === viewerId
                  ? 'own'
                  : 'occupied'
    }
    return interactions
}

function observedPrayerAuraEffects(
    actor: GameCharacter | undefined,
    playerId: string | undefined,
    view: CombatObserver
): PrayerAuraEffectId[] {
    if (
        actor === undefined ||
        actor.id !== playerId ||
        actor.id !== view.observer?.id
    ) {
        return []
    }

    const effects = prayerAuraEffects(actor, view.now)
    const ids: PrayerAuraEffectId[] = []
    if (effects.minimumDamage) {
        ids.push('weakened')
    }
    if (effects.slowMultiplier < 1) {
        ids.push('slowed')
    }
    if (effects.feared) {
        ids.push('feared')
    }
    if (effects.dodgeBonus > 0) {
        ids.push('prayer-protection')
    }
    if (effects.advantage) {
        ids.push('prayer-blessing')
    }
    if (effects.damageTakenMultiplier > 1) {
        ids.push('prayer-vulnerability')
    }
    if (hasRoadPrayerRecovery(actor, view.navigation, view.now)) {
        ids.push('road-prayer-recovery')
    }
    return ids
}

function projectRelationship(
    observer: GameCharacter | undefined,
    target: GameCharacter | undefined,
    playerId: string | undefined,
    now: number
): { relationship: CharacterRelationship; personalHostile?: boolean } {
    if (target === undefined) {
        return { relationship: 'friendly' }
    }
    if (target.id === playerId) {
        return { relationship: 'self' }
    }
    if (
        observer !== undefined &&
        hasAttackRelationship(observer, target, now)
    ) {
        return hasDeclaredHostility(observer, target)
            ? { relationship: 'hostile', personalHostile: true }
            : { relationship: 'hostile' }
    }
    return { relationship: 'friendly' }
}

function observedWorkerActivity(
    context: SnapshotContext,
    actor: GameCharacter | undefined,
    view: CombatObserver,
    playerId?: string
) {
    if (
        actor === undefined ||
        view.observer === undefined ||
        view.navigation === undefined
    ) {
        return undefined
    }
    return actor.id === playerId ||
        canHearSpeech(view.observer, actor, view.navigation, view.now, 80)
        ? context.social?.workerActivity(actor.id, view.now)
        : undefined
}
