import type { GameLocale } from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import type { NpcConversationSource } from './npcReplyQueue'
import type { GameRoom } from './room'
import {
    attributeNpcSpeech,
    createDialogueSpeechEvent,
    createSpeechEvent,
} from './speechReceipts'
import type { WhisperService } from './whispers'

export const NPC_HUM = 'М-м-м-м-м…'

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
    ): void => {
        const line = text.trim().slice(0, 400)
        if (source === 'whisper' && line !== NPC_HUM) {
            whispers.send(npc, recipient, line, now, {
                language: language ?? room.localeFor(recipient.id),
                keepOriginalForRecipient: true,
            })
            return
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
            delete dialogue.textMessage
            dialogue.text = line
            dialogue.speechId = event.speechId
        }
        room.publishEvents([event])
    }
}
