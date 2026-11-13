import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import type { PartyService } from './parties'
import { broadcastEvent, type RoomSocket } from './roomMessaging'
import { centerLocationId, type WorldLocations } from './worldLocations'

export function publishRoomEvents(
    events: GameEventPayload[],
    characters: Map<string, GameCharacter>,
    adventure: AdventureService,
    parties: PartyService,
    socketsIn: (locationId: string) => Iterable<RoomSocket>,
    connections: ReadonlyMap<RoomSocket, string | undefined>,
    world?: WorldLocations
): void {
    if (world !== undefined && events.some((event) => event.kind === 'death')) {
        events = [
            ...events,
            ...events.flatMap((event) => {
                const target =
                    event.kind === 'death' && event.targetId !== undefined
                        ? characters.get(event.targetId)
                        : undefined
                return target === undefined
                    ? []
                    : world
                          .get(target.locationId)
                          .inventory.dropLootForDeaths([event], (id) =>
                              characters.get(id)
                          )
            }),
        ]
    }
    adventure.observe(events, (id) => characters.get(id))
    const partyEvents = parties.observe(events, (id) => characters.get(id))
    for (const event of [...events, ...partyEvents]) {
        const { audienceIds, ...visibleEvent } = event
        if (audienceIds !== undefined) {
            const recipients = [...connections]
                .filter(
                    ([, id]) => id !== undefined && audienceIds.includes(id)
                )
                .map(([socket]) => socket)
            broadcastEvent(recipients, visibleEvent)
            continue
        }
        const actor = characters.get(event.actorId ?? event.targetId ?? '')
        broadcastEvent(
            socketsIn(actor?.locationId ?? centerLocationId),
            visibleEvent
        )
    }
}
