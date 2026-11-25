import {
    type GameLocale,
    PUBLIC_SPEECH_RADIUS,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import type { NpcConversationSource, PendingNpcReply } from './npcReplyQueue'
import type { GameRoom } from './room'
import { canConverseWithNpc } from './socialSpeech'
import {
    attributeNpcSpeech,
    createDialogueSpeechEvent,
    createSpeechEvent,
} from './speechReceipts'
import type { WhisperService } from './whispers'

export const NPC_HUM = 'М-м-м-м-м…'

export function createNpcReplyRecipient(
    room: GameRoom,
    adventure: AdventureService
) {
    return (
        recipientId: string,
        turn: PendingNpcReply,
        npc: GameCharacter | undefined,
        now: number
    ): GameCharacter | undefined => {
        const recipient = room.getCharacter(recipientId)
        if (
            npc?.deathSequence !== turn.deathSequence ||
            npc.locationId !== turn.locationId ||
            recipient?.deathSequence !== turn.recipientDeathSequence ||
            (turn.source === 'panel' &&
                adventure.walletFor(recipientId).dialogue?.npcId !== npc.id) ||
            !canConverseWithNpc(
                recipient,
                npc,
                room.navigationFor(npc),
                now,
                turn.source === 'say' ? PUBLIC_SPEECH_RADIUS : 48
            )
        ) {
            return undefined
        }
        return recipient
    }
}

interface ReplyDestination {
    room: GameRoom
    adventure: AdventureService
    whispers: WhisperService
}

export function createNpcReplyPublisher({
    room,
    adventure,
    whispers,
}: ReplyDestination) {
    return (
        npc: GameCharacter,
        recipient: GameCharacter,
        source: NpcConversationSource,
        text: string,
        now: number,
        language?: GameLocale
    ): boolean => {
        const line = text.trim().slice(0, 400)
        if (line === '') {
            return false
        }
        if (source === 'whisper' && line !== NPC_HUM) {
            const sent = whispers.send(npc, recipient, line, now, {
                language: language ?? room.localeFor(recipient.id),
                keepOriginalForRecipient: true,
            })
            room.social.merchantVisits.offered(npc, recipient, line, now, sent)
            return sent
        }
        const event =
            source === 'panel'
                ? createDialogueSpeechEvent(npc, recipient, line)
                : source === 'say'
                  ? createSpeechEvent(npc, line)
                  : createSpeechEvent(npc, line, {
                        targetId: recipient.id,
                        audienceIds: [recipient.id],
                    })
        if (source === 'say') {
            event.channel = 'say'
        }
        if (language !== undefined) {
            event.language = language
            attributeNpcSpeech(event, recipient.id)
        }
        const dialogue = adventure.walletFor(recipient.id).dialogue
        if (source === 'panel' && dialogue?.npcId === npc.id) {
            delete dialogue.initialView
            delete dialogue.initialMarketSide
            delete dialogue.textMessage
            dialogue.text = line
            dialogue.speechId = event.speechId
        }
        room.publishEvents([event])
        room.social.merchantVisits.offered(npc, recipient, line, now)
        return true
    }
}
