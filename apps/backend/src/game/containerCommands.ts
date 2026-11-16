import type {
    ChestClientMessage,
    ChestContainerSnapshot,
    GameEventPayload,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { ChestContainers } from './chestContainers'

export function executeContainerCommand(
    containers: ChestContainers,
    actor: GameCharacter,
    message: ChestClientMessage,
    now: number
) {
    const before = containers.snapshot(actor, now)
    const events = containers.handle(actor, message, now)
    const chest = containers.snapshot(actor, now)
    const accepted = containerCommandSucceeded(message, before, chest, events)
    return {
        accepted,
        error: accepted
            ? null
            : (events.find((event) => event.kind === 'notice')?.text ??
              'Действие с контейнером не выполнено.'),
        events,
        chest,
    }
}

function containerCommandSucceeded(
    message: ChestClientMessage,
    before: ChestContainerSnapshot | null,
    chest: ChestContainerSnapshot | null,
    events: GameEventPayload[]
): boolean {
    if (message.type === 'open_chest') {
        return chest?.chestId === message.chestId
    }
    if (message.type === 'close_chest') {
        return chest?.chestId !== message.chestId
    }
    return (
        events.some(
            (event) =>
                event.kind === 'item_pickup' || event.kind === 'item_stash'
        ) ||
        (before?.chestId === message.chestId &&
            (before.gold ?? 0) > (chest?.gold ?? 0))
    )
}
