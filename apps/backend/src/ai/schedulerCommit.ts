import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import { npcCombatReactionStillAvailable } from './combatReactions'
import { hasNpcReplyControl } from './npcTurnLease'
import type { NpcAiActorState } from './runtimeState'
import type { TurnInformation } from './turnInformation'

/** Bridge one asynchronous reply into the simulation tick for validation and commit. */
export function prepareNpcTurnEligibility(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    actor: GameCharacter,
    now: () => number
) {
    const generation = state.generation
    const dialogue = state.dialogue
    const combatReaction =
        state.task?.background === 'combat_reaction' && dialogue === undefined
    const background = dialogue === undefined && state.task?.requesterId == null
    return () =>
        generation === state.generation &&
        hasNpcReplyControl(companions, actor, state, now()) &&
        (dialogue === undefined ||
            room.social.npcSpeech.turns.available(actor, dialogue, now())) &&
        (!combatReaction ||
            npcCombatReactionStillAvailable(room, state, now())) &&
        (!background || room.allowsAutonomousNpcAi())
}

export function prepareNpcReplyCommit(
    state: NpcAiActorState,
    current: () => boolean
): NonNullable<TurnInformation['commitReply']> {
    const generation = state.generation
    return (reply) =>
        new Promise((resolve) => {
            if (!current()) {
                if (generation === state.generation) {
                    state.controller?.abort()
                }
                resolve({
                    code: 'command_unavailable',
                    reason: {
                        code: 'cancelled',
                        detail: 'Этот ход больше не действует.',
                    },
                })
                return
            }
            state.finalizing = {
                reply,
                resolve,
                retirementRevision: state.mind.retirementRevision,
            }
        })
}
