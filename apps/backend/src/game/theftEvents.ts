import type { GameEventPayload } from '@my-game-ratata/contracts'

export function privateTheftNotice(
    actorId: string,
    text: string,
    targetId?: string
): GameEventPayload {
    return {
        kind: 'notice',
        actorId,
        audienceIds: [actorId],
        text,
        ...(targetId === undefined ? {} : { targetId }),
    }
}
