import type { GameRoom } from '../game/room'
import { CharacterKnowledge } from './characterKnowledge'
import { characterKnowledge, roomKnowledgeContext } from './knowledgeCatalog'

/** Resolve conditional residents from this world before and after asynchronous retrieval. */
export function createRoomKnowledge(
    room: Pick<GameRoom, 'getCharacter'>
): CharacterKnowledge {
    return new CharacterKnowledge(undefined, undefined, (actor, navigation) =>
        characterKnowledge(actor, navigation, roomKnowledgeContext(room))
    )
}
