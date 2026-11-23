import {
    type ClientMessage,
    NPC_ENGLISH_NAMES,
    PUBLIC_SPEECH_RADIUS,
} from '@my-game-ratata/contracts'

import type { NpcAiCoordinator } from '../ai/coordinator'
import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'
import { afterNpcSpokenName, afterPlayerSpokenName } from './npcSpeechNames'
import type { GameRoom } from './room'
import type { NpcHeardSpeech } from './roomNpcConversations'
import { canConverseWithNpc, speechAvailable } from './socialSpeech'
import { projectSpeechFocus } from './speechFocus'
import { createSpeechEvent } from './speechReceipts'

export type NearbySpeechObserver = (
    speech: NpcHeardSpeech,
    targetIds: readonly string[] | undefined
) => void

export function sayNearby(
    room: GameRoom,
    ai: NpcAiCoordinator | undefined,
    actor: GameCharacter,
    message: Extract<ClientMessage, { type: 'chat' }>,
    now: number,
    onSpeech?: NearbySpeechObserver
): void {
    if (!speechAvailable(actor) || !actor.soul.canSpeak) {
        return
    }

    const event = createSpeechEvent(actor, message.text)
    event.channel = 'say'
    const focus = projectSpeechFocus(room, actor, message.focusKey, now)
    room.publishEvents([event])
    const selected = message.targetId ?? characterFocusId(message.focusKey)
    const targets =
        selected === undefined
            ? namedTargets(room, actor, message.text, now)
            : [selected]
    const speech: NpcHeardSpeech = {
        kind: 'message',
        id: `say:${actor.id}:${String(event.speechId)}`,
        senderId: actor.id,
        text: message.text,
        channel: 'say',
        ...(focus === undefined ? {} : { focus }),
        locationId: actor.locationId,
        position: { ...actor.position },
        at: now,
    }
    onSpeech?.(speech, targets)
    receiveNearby(room, ai, actor, speech, targets)
}

function characterFocusId(key: string | undefined): string | undefined {
    const prefix = 'character:'
    return key?.startsWith(prefix) === true
        ? key.slice(prefix.length)
        : undefined
}

function namedTargets(
    room: GameRoom,
    actor: GameCharacter,
    text: string,
    now: number
): string[] | undefined {
    const ids = new Set([
        ...Object.keys(NPC_ENGLISH_NAMES),
        ...room.charactersFor(actor).map((character) => character.id),
    ])
    const navigation = room.navigationFor(actor)
    const matches = [...ids].flatMap((id) => {
        const candidate = room.getCharacter(id)
        const remainder =
            candidate?.controllerKind === 'network_player'
                ? playerNameRemainder(actor, candidate, navigation, now, text)
                : afterNpcSpokenName(id, candidate?.nickname ?? '', text)
        return remainder === undefined
            ? []
            : [{ id, remaining: remainder.length }]
    })
    const shortest = Math.min(...matches.map(({ remaining }) => remaining))
    return matches.length === 0
        ? undefined
        : matches
              .filter(({ remaining }) => remaining === shortest)
              .map(({ id }) => id)
}

function playerNameRemainder(
    speaker: GameCharacter,
    candidate: GameCharacter,
    navigation: NavigationService,
    now: number,
    text: string
): string | undefined {
    return canConverseWithNpc(
        speaker,
        candidate,
        navigation,
        now,
        PUBLIC_SPEECH_RADIUS
    )
        ? afterPlayerSpokenName(candidate.nickname, text)
        : undefined
}

function receiveNearby(
    room: GameRoom,
    ai: NpcAiCoordinator | undefined,
    actor: GameCharacter,
    event: NpcHeardSpeech,
    targetIds: readonly string[] | undefined
): void {
    if (actor.controllerKind !== 'network_player') {
        return
    }
    const candidates =
        targetIds === undefined
            ? room.charactersFor(actor)
            : targetIds.map((id) => room.getCharacter(id))
    const navigation = room.navigationFor(actor)
    const audibleNpcs = candidates.filter(
        (npc): npc is GameCharacter =>
            npc !== undefined &&
            npc.controllerKind !== 'network_player' &&
            npc.soul.controlSource !== 'human' &&
            npc.trainingTarget === undefined &&
            canConverseWithNpc(
                npc,
                actor,
                navigation,
                event.at,
                PUBLIC_SPEECH_RADIUS
            )
    )
    const listeners = audibleNpcs.filter(
        (npc) => ai?.configured(npc.id) === true
    )
    const recipient =
        targetIds !== undefined && audibleNpcs.length === 1
            ? audibleNpcs[0]
            : undefined
    const speech: NpcHeardSpeech = {
        ...event,
        nearby: recipient === undefined ? 'broadcast' : 'addressed',
        ambiguous:
            listeners.length > 1 ||
            (targetIds !== undefined && audibleNpcs.length > 1),
    }
    const contacts = room.social.npcSpeech
    const heard =
        recipient === undefined
            ? speech
            : contacts.observeAddressedSpeech(
                  actor,
                  recipient,
                  speech,
                  listeners.includes(recipient)
              )
    for (const turn of contacts.turns.enqueueNearby(actor, listeners, heard)) {
        if (recipient === undefined) {
            room.rememberNpcMeeting(actor, turn.npc)
        }
        ai?.hear(actor, turn.speech, turn.npc.id)
    }
}
