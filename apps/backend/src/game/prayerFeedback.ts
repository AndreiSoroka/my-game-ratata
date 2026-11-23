import {
    authoredPhrase,
    type GameEventPayload,
    type PrayerActionId,
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
        ...authoredPhrase('combat.prayerUnanswered'),
    }
}
