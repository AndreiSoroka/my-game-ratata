import type { PrivateSpeechSnapshot } from '@my-game-ratata/contracts'

import { memoryForCharacter } from '../ai/characterMinds'
import type { NpcAiCoordinator } from '../ai/coordinator'
import type { GameCharacter } from './character'
import type { QuestTurnInService } from './questTurnIn'

/** WhisperService invokes this only after validating the ordinary speaking pair. */
export function createWhisperObserver(
    ai: () => NpcAiCoordinator | undefined,
    turnIns: () => QuestTurnInService
) {
    return (
        actor: GameCharacter,
        listener: GameCharacter,
        message: PrivateSpeechSnapshot
    ): void => {
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
        turnIns().heard(actor, listener, message.text, message.id, message.at)
        ai()?.hear(
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
