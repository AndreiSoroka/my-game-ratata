import { isItemBroken } from '@my-game-ratata/contracts'

import { repairSnapshot } from './adventureTrading'
import type { GameCharacter } from './character'
import type { GameRoom } from './room'
import { recordWorkerActivity } from './workerActivityState'
import { executeWorkerAdventure } from './workerCommands'
import { approachCharacter } from './workerNavigation'

/** Returns the next ordinary decision delay while maintenance owns the policy. */
export function repairWorker(
    actor: GameCharacter,
    room: GameRoom,
    now: number,
    requestId: () => string
): number | undefined {
    if (!Object.values(actor.equipment).some(isItemBroken)) {
        return undefined
    }
    const smith = room.getCharacter('npc_smith_1')
    recordWorkerActivity(
        actor,
        {
            reason: 'repair',
            text:
                smith?.alive === true
                    ? 'Иду к кузнецу ремонтировать сломанное снаряжение.'
                    : 'Снаряжение сломано, а кузнец сейчас недоступен.',
            intent: 'repair',
        },
        now
    )
    if (smith?.alive !== true || !approachCharacter(actor, room, smith)) {
        return 500
    }
    const quote = repairSnapshot(actor)
    const result = executeWorkerAdventure(
        actor,
        room,
        {
            type: 'repair_items',
            npcId: smith.id,
            instanceIds: quote.items.map((item) => item.instanceId),
            expectedTotal: quote.total,
            requestId: requestId(),
        },
        now
    )
    return result.accepted ? 500 : 10_000
}
