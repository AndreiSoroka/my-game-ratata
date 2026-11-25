import type { PrivateSpeechSnapshot } from '@my-game-ratata/contracts'

import { memoryForCharacter } from '../ai/characterMinds'
import type { GameCharacter } from './character'
import type { QuestTurnInService } from './questTurnIn'
import type { NpcHeardSpeech } from './roomNpcConversations'

/** WhisperService invokes this only after validating the ordinary speaking pair. */
export function createWhisperObserver(
    hear: (
        actor: GameCharacter,
        event: NpcHeardSpeech,
        targetId: string
    ) => void,
    turnIns: () => QuestTurnInService,
    onDelivered?: (actor: GameCharacter, listener: GameCharacter) => void,
    onAddressed?: (
        actor: GameCharacter,
        listener: GameCharacter,
        text: string,
        now: number,
        handleQuest: () => boolean
    ) => boolean
) {
    return (
        actor: GameCharacter,
        listener: GameCharacter,
        message: PrivateSpeechSnapshot
    ): void => {
        onDelivered?.(actor, listener)
        for (const owner of [actor, listener]) {
            if (owner.controllerKind !== 'network_player') {
                memoryForCharacter(owner).remember({
                    id: message.id,
                    senderId: actor.id,
                    senderName: actor.nickname,
                    recipientId: listener.id,
                    text: message.text,
                    channel: 'whisper',
                    source: 'heard',
                    at: message.at,
                    locationId: actor.locationId,
                })
            }
        }
        const handleQuest = () =>
            turnIns().heard(actor, listener, message.text, message.at)
        if (
            onAddressed?.(
                actor,
                listener,
                message.text,
                message.at,
                handleQuest
            ) ??
            handleQuest()
        ) {
            return
        }
        hear(
            actor,
            {
                kind: 'message',
                id: message.id,
                senderId: actor.id,
                text: message.text,
                channel: 'whisper',
                locationId: actor.locationId,
                position: { ...actor.position },
                at: message.at,
            },
            listener.id
        )
    }
}
