import {
    detectSpeechLanguage,
    type GameEventPayload,
    type GameLocale,
} from '@my-game-ratata/contracts'

import { rememberPublishedSpeech } from '../ai/memoryObservation'
import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import { garbleText } from './chat'
import { type CombatObserver, observeCombatEvent } from './combatObservation'
import { CONVERSATION_REACH } from './conversationSessions'
import type { PartyService } from './parties'
import { type RoomSocket, send } from './roomMessaging'
import { canHearSpeech } from './socialSpeech'
import {
    isDialogueSpeech,
    npcReplyRecipient,
    stampSpeechEvent,
} from './speechReceipts'
import type {
    RoomSpeechTranslations,
    SpeechRecipient,
} from './speechTranslation'
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
    objectiveEvents = events,
    speechTranslations?: RoomSpeechTranslations,
    now = Date.now()
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
            hasModelLease,
            speechTranslations,
            now
        )
    }
    if (world !== undefined) {
        rememberRoomSpeech([...events, ...partyEvents], characters, world, now)
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
    world: WorldLocations,
    now: number
): void {
    rememberPublishedSpeech(
        {
            getCharacter: (id) => characters.get(id),
            navigationFor: (actor) => world.get(actor.locationId).navigation,
        },
        events,
        characters.values(),
        now
    )
}
interface ObservedSpeech {
    text: string
    language: GameLocale | undefined
    speaker: GameCharacter | undefined
    replyRecipient: string | undefined
    voice: GameEventPayload['voice']
}

function describeSpeech(
    event: GameEventPayload,
    characters: ReadonlyMap<string, GameCharacter>
): ObservedSpeech | undefined {
    if (event.kind !== 'chat' || event.text === undefined) {
        return undefined
    }
    const speaker = characters.get(event.actorId ?? '')
    return {
        text: event.text,
        language: event.language ?? detectSpeechLanguage(event.text),
        speaker,
        replyRecipient: npcReplyRecipient(event),
        voice:
            speaker === undefined
                ? undefined
                : npcVoiceKind(event, speaker, event.text),
    }
}

function deliverObservedEvent(
    event: GameEventPayload,
    recipients: Iterable<RoomSocket>,
    characters: Map<string, GameCharacter>,
    connections: ReadonlyMap<RoomSocket, string | undefined>,
    world: WorldLocations | undefined,
    hasModelLease: CombatObserver['hasModelLease'],
    speechTranslations: RoomSpeechTranslations | undefined,
    now: number
): void {
    const speech = describeSpeech(event, characters)
    const translationRecipients: SpeechRecipient[] = []
    for (const socket of recipients) {
        const observer = characters.get(connections.get(socket) ?? '')
        const view: CombatObserver = {
            observer,
            getCharacter: (id) => characters.get(id),
            navigation:
                observer === undefined
                    ? undefined
                    : world?.get(observer.locationId).navigation,
            now,
            ...(hasModelLease === undefined ? {} : { hasModelLease }),
        }
        const visible = observeCombatEvent(event, view)
        if (visible === undefined) {
            continue
        }
        if (
            visible.kind === 'chat' &&
            projectSpeech(visible, event, speech, view) &&
            observer !== undefined
        ) {
            const recipient = speechTranslations?.recipient(socket, observer)
            if (recipient !== undefined) {
                translationRecipients.push(recipient)
            }
        }
        send(socket, { type: 'event', serverTime: view.now, event: visible })
    }
    enqueueTranslation(event, speech, speechTranslations, translationRecipients)
}

function enqueueTranslation(
    event: GameEventPayload,
    speech: ObservedSpeech | undefined,
    service: RoomSpeechTranslations | undefined,
    recipients: SpeechRecipient[]
): void {
    const { actorId, speechId } = event
    if (
        speech?.language !== undefined &&
        actorId !== undefined &&
        speechId !== undefined
    ) {
        service?.publish(
            actorId,
            speechId,
            speech.text,
            speech.language,
            recipients
        )
    }
}

function projectSpeech(
    visible: GameEventPayload,
    source: GameEventPayload,
    speech: ObservedSpeech | undefined,
    view: CombatObserver
): boolean {
    delete visible.voice
    if (speech === undefined) {
        return false
    }
    if (speech.speaker !== undefined && visible.actorId !== undefined) {
        visible.speakerName = speech.speaker.nickname
    }
    const heard =
        visible.actorId !== undefined && canHearObservedSpeech(speech, view)
    const readable = heard || canReadUnheardSpeech(source, speech, view)
    if (!readable) {
        visible.text = garbleText(speech.text)
    }
    if (!readable || visible.actorId === undefined) {
        delete visible.language
        delete visible.textMessage
        return false
    }
    if (speech.language !== undefined) {
        visible.language = speech.language
    }
    if (!heard) {
        return false
    }
    projectNpcVoice(visible, speech)
    return isTranslationCandidate(source, speech, view.observer?.id)
}

function canHearObservedSpeech(
    speech: ObservedSpeech,
    { observer, navigation, now }: CombatObserver
): boolean {
    return (
        observer !== undefined &&
        navigation !== undefined &&
        speech.speaker !== undefined &&
        canHearSpeech(
            observer,
            speech.speaker,
            navigation,
            now,
            speech.voice === 'dialogue' ? CONVERSATION_REACH : undefined
        )
    )
}

function canReadUnheardSpeech(
    source: GameEventPayload,
    speech: ObservedSpeech,
    { observer, navigation }: CombatObserver
): boolean {
    return (
        source.audienceIds !== undefined ||
        observer === undefined ||
        observer.id === source.actorId ||
        navigation === undefined ||
        speech.speaker === undefined
    )
}

function projectNpcVoice(
    visible: GameEventPayload,
    { speaker, voice }: ObservedSpeech
): void {
    if (voice !== undefined && speaker !== undefined) {
        visible.voice = voice
        visible.locationId = speaker.locationId
    }
}

function isTranslationCandidate(
    source: GameEventPayload,
    speech: ObservedSpeech,
    listenerId: string | undefined
): boolean {
    return (
        speech.language !== undefined &&
        source.textMessage === undefined &&
        source.channel !== 'whisper' &&
        listenerId !== speech.replyRecipient
    )
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
