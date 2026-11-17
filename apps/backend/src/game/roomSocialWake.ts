import type { NpcAiCoordinator } from '../ai/coordinator'
import type { GameRoom } from './room'

/** System notices wake the correct pair without inventing a human utterance. */
export function createSocialWake(
    room: GameRoom,
    ai: () => NpcAiCoordinator | undefined
) {
    let sequence = 0
    return (
        targetId: string,
        senderId: string,
        text: string,
        now: number
    ): void => {
        const actor = room.getCharacter(senderId)
        if (actor === undefined) {
            return
        }
        ai()?.hear(
            actor,
            {
                kind: 'message',
                id: `social:${String(++sequence)}`,
                senderId,
                text,
                channel: 'whisper',
                system: true,
                locationId: actor.locationId,
                position: { ...actor.position },
                at: now,
            },
            targetId
        )
    }
}
