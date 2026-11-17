import type {
    CharacterRelationship,
    CharacterSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    type CombatObserver,
    observeCharacterCombat,
} from './combatObservation'
import { snapshotCompanionSoul } from './companionState'
import { canTargetByFaction } from './factions'
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
    return {
        ...observeCharacterCombat(character, actor, view),
        ...(context.social === undefined || actor === undefined
            ? {}
            : { interactions: context.social.interactions(actor) }),
        ...(activity === undefined ? {} : { workerActivity: activity }),
        ...(character.soul === undefined
            ? {}
            : {
                  soul: snapshotCompanionSoul(actor, character.soul, playerId),
              }),
        relationship: relationshipFor(view.observer, actor, playerId, view.now),
        control:
            character.id === playerId
                ? (character.control ?? { mode: 'none', targetId: null })
                : { mode: 'none', targetId: null },
        inventory: character.id === playerId ? character.inventory : [],
        theft: context.theft.snapshot(character.id, playerId, view.now),
    }
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
