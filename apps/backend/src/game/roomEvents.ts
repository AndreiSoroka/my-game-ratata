import type { GameEventPayload } from '@my-game-ratata/contracts'

import { rememberPublishedSpeech } from '../ai/memoryObservation'
import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import { garbleText } from './chat'
import { type CombatObserver, observeCombatEvent } from './combatObservation'
import { CONVERSATION_REACH } from './conversationSessions'
import type { NavigationService } from './navigation'
import type { PartyService } from './parties'
import { type RoomSocket, send } from './roomMessaging'
import { canHearSpeech } from './socialSpeech'
import { isDialogueSpeech, stampSpeechEvent } from './speechReceipts'
import { centerLocationId, type WorldLocations } from './worldLocations'

export function publishRoomEvents(
    events: GameEventPayload[],
    characters: Map<string, GameCharacter>,
    adventure: AdventureService,
    parties: PartyService,
    socketsIn: (locationId: string) => Iterable<RoomSocket>,
    connections: ReadonlyMap<RoomSocket, string | undefined>,
    world?: WorldLocations,
    hasModelLease?: (character: GameCharacter, now: number) => boolean,
    objectiveEvents = events
): void {
    if (world !== undefined && events.some((event) => event.kind === 'death')) {
        const drops = events.flatMap((event) => {
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
        })
        events = [...events, ...drops]
        objectiveEvents = [...objectiveEvents, ...drops]
    }
    adventure.observe(
        objectiveEvents,
        (id) => characters.get(id),
        world === undefined
            ? undefined
            : (actor) => world.get(actor.locationId).navigation
    )
    const partyEvents = parties.observe(objectiveEvents, (id) =>
        characters.get(id)
    )
    for (const event of [...events, ...partyEvents]) {
        stampSpeechEvent(event, characters.get(event.actorId ?? ''))
        const recipients =
            event.audienceIds === undefined
                ? socketsIn(eventLocation(event, characters))
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
    if (world !== undefined) {
        rememberRoomSpeech([...events, ...partyEvents], characters, world)
    }
}

function eventLocation(
    event: GameEventPayload,
    characters: ReadonlyMap<string, GameCharacter>
): string {
    return (
        event.locationId ??
        characters.get(event.actorId ?? event.targetId ?? '')?.locationId ??
        centerLocationId
    )
}
function rememberRoomSpeech(
    events: GameEventPayload[],
    characters: Map<string, GameCharacter>,
    world: WorldLocations
): void {
    rememberPublishedSpeech(
        {
            getCharacter: (id) => characters.get(id),
            navigationFor: (actor) => world.get(actor.locationId).navigation,
        },
        events,
        characters.values(),
        Date.now()
    )
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
        const navigation =
            observer === undefined
                ? undefined
                : world?.get(observer.locationId).navigation
        const visibleEvent = observeCombatEvent(event, {
            observer,
            getCharacter: (id) => characters.get(id),
            navigation,
            now,
            ...(hasModelLease === undefined ? {} : { hasModelLease }),
        })
        if (visibleEvent !== undefined) {
            if (visibleEvent.kind === 'chat') {
                projectSpeech(
                    visibleEvent,
                    event,
                    observer,
                    characters.get(event.actorId ?? ''),
                    navigation,
                    now
                )
            }
            send(socket, {
                type: 'event',
                serverTime: now,
                event: visibleEvent,
            })
        }
    }
}

function projectSpeech(
    visible: GameEventPayload,
    source: GameEventPayload,
    observer: GameCharacter | undefined,
    speaker: GameCharacter | undefined,
    navigation: NavigationService | undefined,
    now: number
): void {
    delete visible.voice
    if (speaker === undefined) {
        return
    }
    if (visible.actorId !== undefined) {
        visible.speakerName = speaker.nickname
    }
    if (
        source.text === undefined ||
        observer === undefined ||
        observer.id === speaker.id ||
        navigation === undefined
    ) {
        return
    }
    const voice = npcVoiceKind(source, speaker, source.text)
    if (
        !canHearSpeech(
            observer,
            speaker,
            navigation,
            now,
            voice === 'dialogue' ? CONVERSATION_REACH : undefined
        )
    ) {
        if (source.audienceIds === undefined) {
            visible.text = garbleText(source.text)
        }
        return
    }
    if (voice !== undefined && visible.actorId !== undefined) {
        visible.voice = voice
        visible.locationId = speaker.locationId
    }
}

function npcVoiceKind(
    source: GameEventPayload,
    speaker: GameCharacter,
    text: string
): GameEventPayload['voice'] {
    if (
        speaker.controllerKind === 'network_player' ||
        source.channel === 'whisper' ||
        source.speechId === undefined ||
        text.trim() === ''
    ) {
        return undefined
    }
    return isDialogueSpeech(source) ? 'dialogue' : 'ambient'
}
