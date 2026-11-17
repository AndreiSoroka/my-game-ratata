import type { AdventureClientMessage } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { GameRoom } from './room'
import { recordWorkerResult } from './workerActivityState'

export function executeWorkerAdventure(
    actor: GameCharacter,
    room: GameRoom,
    message: AdventureClientMessage,
    now: number
) {
    const result = room.requestAdventure(actor, message, now)
    recordWorkerResult(actor, message.type, result, now)
    room.publishEvents(result.events)
    return result
}
