import type {
    CharacterInteractions,
    CharacterRelationship,
    CharacterSnapshot,
    PrayerAuraEffectId,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    type CombatObserver,
    observeCharacterCombat,
} from './combatObservation'
import { canTargetByFaction } from './factions'
import { prayerAuraEffects } from './prayerAuras'
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
    delete observed.prayerAuraEffects
    return {
        ...observed,
        ...(interactions === undefined ? {} : { interactions }),
        ...(activity === undefined ? {} : { workerActivity: activity }),
        ...(auraEffects.length === 0 ? {} : { prayerAuraEffects: auraEffects }),
        relationship: relationshipFor(view.observer, actor, playerId, view.now),
        control:
            character.id === playerId
                ? (character.control ?? { mode: 'none', targetId: null })
                : { mode: 'none', targetId: null },
        inventory: character.id === playerId ? character.inventory : [],
        theft: context.theft.snapshot(character.id, playerId, view.now),
    }
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
        !interactions.aiDialogue
    ) {
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
    return ids
}

function relationshipFor(
    observer: GameCharacter | undefined,
    target: GameCharacter | undefined,
    playerId: string | undefined,
    now: number
): CharacterRelationship {
    if (target === undefined) {
        return 'friendly'
    }
    if (target.id === playerId) {
        return 'self'
    }
    return observer !== undefined && canTargetByFaction(observer, target, now)
        ? 'hostile'
        : 'friendly'
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
