import type {
    GameEventPayload,
    PrayerActionId,
} from '@my-game-ratata/contracts'

export function unansweredPrayer(
    actorId: string,
    abilityId: PrayerActionId
): GameEventPayload {
    return {
        kind: 'notice',
        noticeKind: 'prayer_unanswered',
        actorId,
        audienceIds: [actorId],
        abilityId,
        text: 'Божество не ответило',
    }
}
