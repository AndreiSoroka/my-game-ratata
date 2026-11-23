import type { GameCharacter } from '../game/character'
import type { GameRoom } from '../game/room'
import type { NpcAiActorState } from './runtimeState'
import type { TurnInformation } from './turnInformation'

/** Bridge one asynchronous reply into the simulation tick for validation and commit. */
export function prepareNpcTurnEligibility(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    now: () => number
) {
    const generation = state.generation
    const dialogue = state.dialogue
    const background = dialogue === undefined && state.task?.requesterId == null
    return () =>
        generation === state.generation &&
        (dialogue === undefined ||
            room.social.npcSpeech.turns.available(actor, dialogue, now())) &&
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
