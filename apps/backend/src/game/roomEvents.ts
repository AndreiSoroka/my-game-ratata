import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import { garbleText } from './chat'
import { type CombatObserver, observeCombatEvent } from './combatObservation'
import type { PartyService } from './parties'
import { type RoomSocket, send } from './roomMessaging'
import { canHearSpeech } from './socialSpeech'
import { stampSpeechEvent } from './speechReceipts'
import { centerLocationId, type WorldLocations } from './worldLocations'

export function publishRoomEvents(
    events: GameEventPayload[],
    characters: Map<string, GameCharacter>,
    adventure: AdventureService,
    parties: PartyService,
    socketsIn: (locationId: string) => Iterable<RoomSocket>,
    connections: ReadonlyMap<RoomSocket, string | undefined>,
    world?: WorldLocations,
    hasModelLease?: (character: GameCharacter, now: number) => boolean
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
        stampSpeechEvent(event, characters.get(event.actorId ?? ''))
        const actor = characters.get(event.actorId ?? event.targetId ?? '')
        const recipients =
            event.audienceIds === undefined
                ? socketsIn(actor?.locationId ?? centerLocationId)
                : connections.keys()
        deliverObservedEvent(
            event,
            recipients,
            characters,
            connections,
            world,
            hasModelLease
        )
    }
}
function deliverObservedEvent(
    event: GameEventPayload,
    recipients: Iterable<RoomSocket>,
    characters: Map<string, GameCharacter>,
    connections: ReadonlyMap<RoomSocket, string | undefined>,
    world: WorldLocations | undefined,
    hasModelLease: CombatObserver['hasModelLease']
): void {
    for (const socket of recipients) {
        const observerId = connections.get(socket)
        const observer =
            observerId === undefined ? undefined : characters.get(observerId)
        const now = Date.now()
        const visibleEvent = observeCombatEvent(event, {
            observer,
            getCharacter: (id) => characters.get(id),
            navigation:
                observer === undefined
                    ? undefined
                    : world?.get(observer.locationId).navigation,
            now,
            ...(hasModelLease === undefined ? {} : { hasModelLease }),
        })
        if (visibleEvent !== undefined) {
            projectPublicSpeech(
                visibleEvent,
                event,
                observer,
                characters,
                world,
                now
            )
            if (visibleEvent.kind === 'chat') {
                const speaker = characters.get(event.actorId ?? '')
                if (
                    speaker !== undefined &&
                    visibleEvent.actorId !== undefined
                ) {
                    visibleEvent.speakerName = speaker.nickname
                }
            }
            send(socket, {
                type: 'event',
                serverTime: now,
                event: visibleEvent,
            })
        }
    }
}

function projectPublicSpeech(
    visible: GameEventPayload,
    source: GameEventPayload,
    observer: GameCharacter | undefined,
    characters: ReadonlyMap<string, GameCharacter>,
    world: WorldLocations | undefined,
    now: number
): void {
    if (
        source.kind !== 'chat' ||
        source.audienceIds !== undefined ||
        source.text === undefined ||
        observer === undefined ||
        observer.id === source.actorId ||
        world === undefined
    ) {
        return
    }
    const speaker = characters.get(source.actorId ?? '')
    if (
        speaker !== undefined &&
        !canHearSpeech(
            observer,
            speaker,
            world.get(observer.locationId).navigation,
            now
        )
    ) {
        visible.text = garbleText(source.text)
    }
}
