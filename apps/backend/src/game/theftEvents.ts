import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { humanControlled } from './crimeRules'

export function caughtTheftNotices(
    thief: GameCharacter,
    victim: GameCharacter
): GameEventPayload[] {
    const events = [
        privateTheftNotice(
            victim.id,
            `${thief.nickname} пытался обокрасть тебя. Можно защищаться и позвать стражу.`,
            thief.id
        ),
    ]
    if (!humanControlled(victim) && victim.soul.canSpeak) {
        events.push(
            privateTheftNotice(thief.id, 'Попытку кражи заметили.', victim.id)
        )
    }
    return events
}

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
