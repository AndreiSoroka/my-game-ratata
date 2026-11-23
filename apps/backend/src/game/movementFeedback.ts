import {
    authoredPhrase,
    type GameEventPayload,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canWalkDuringPrayer } from './combatMovement'
import { effectiveDashCost } from './effectiveParameters'
import { handleMovementCommand, movementActionAllowed } from './movementActions'

/** Explain a requested action without changing shared movement rules. */
export function handleDashWithFeedback(
    character: GameCharacter,
    now: number
): GameEventPayload[] {
    if (movementActionAllowed(character, { type: 'dash' }, now)) {
        return handleMovementCommand(character, { type: 'dash' }, now)
    }
    if (!character.alive || character.tags.has('offline')) {
        return []
    }
    return [
        {
            kind: 'notice',
            noticeKind: 'dash_rejected',
            actorId: character.id,
            audienceIds: [character.id],
            ...dashReason(character, now),
        },
    ]
}

function dashReason(
    character: GameCharacter,
    now: number
): ReturnType<typeof authoredPhrase> {
    if (character.stunUntil > now) {
        return authoredPhrase('combat.dashStunned')
    }
    if (character.isActionLocked(now) && !canWalkDuringPrayer(character)) {
        return authoredPhrase('combat.actionInProgress')
    }
    const cooldown = character.movement.dashAvailableAt - now
    if (cooldown > 0) {
        return authoredPhrase('combat.dashCooldown', {
            seconds: Math.ceil(cooldown / 1000),
        })
    }
    return authoredPhrase(
        character.energy < effectiveDashCost(character, now)
            ? 'combat.lowEnergy'
            : 'combat.dashUnavailable'
    )
}
