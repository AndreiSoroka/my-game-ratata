import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import type { CharacterKnowledge } from './characterKnowledge'
import { projectContracts } from './contractProjection'
import { characterKnowledgeScope } from './knowledgeScope'
import { npcAiActorAvailable, type NpcAiActorState } from './runtimeState'
import type { TurnInformation } from './turnInformation'

interface KnowledgeTurn {
    state: NpcAiActorState
    actor: GameCharacter
    room: GameRoom
    knowledge: Pick<CharacterKnowledge, 'retrieve' | 'deep'>
    companions: Pick<CompanionService, 'isModelControlOwner'>
    current: () => boolean
    clock: () => number
}

/** Both lookup ports are bound to this exact living identity and control generation. */
export function npcKnowledgeInformation(
    turn: KnowledgeTurn
): Pick<TurnInformation, 'current' | 'lookup' | 'search' | 'scope'> {
    const { state, actor, room, knowledge } = turn
    const mind = state.mind
    const retirementRevision = mind.retirementRevision
    const generation = state.generation
    const token = state.token
    const query = state.dialogue?.text ?? state.task?.request ?? ''
    const leaseCurrent = () =>
        state.config.mode === 'dialogue_only' ||
        (token !== undefined &&
            turn.companions.isModelControlOwner(actor, token, turn.clock()))
    const current = () =>
        turn.current() &&
        state.generation === generation &&
        state.actor === actor &&
        state.mind === mind &&
        mind.retirementRevision === retirementRevision &&
        state.token === token &&
        room.getCharacter(actor.id) === actor &&
        npcAiActorAvailable(actor) &&
        leaseCurrent()
    const guarded = async <T>(lookup: () => Promise<T>): Promise<T> => {
        if (!current()) {
            throw new Error('NPC information authority changed')
        }
        const result = await lookup()
        if (!current()) {
            throw new Error('NPC information authority changed')
        }
        return result
    }
    return {
        current,
        scope: () => characterKnowledgeScope(actor, false),
        search: (searchQuery) =>
            guarded(() =>
                knowledge.retrieve(
                    actor,
                    room.navigationFor(actor),
                    mind,
                    searchQuery
                )
            ),
        lookup: (personId) =>
            guarded(async () => {
                const result = await knowledge.deep(mind, personId, query)
                return result.status === 'found'
                    ? {
                          ...result,
                          contracts: projectContracts(
                              room.social.conversation(
                                  actor.id,
                                  personId,
                                  turn.clock()
                              ),
                              query
                          ),
                      }
                    : result
            }),
    }
}
