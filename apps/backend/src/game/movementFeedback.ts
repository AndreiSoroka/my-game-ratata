import type { GameEventPayload } from '@my-game-ratata/contracts'

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
    const text = dashReason(character, now)
    return [
        {
            kind: 'notice',
            noticeKind: 'dash_rejected',
            actorId: character.id,
            audienceIds: [character.id],
            text,
        },
    ]
}

function dashReason(character: GameCharacter, now: number): string {
    if (character.stunUntil > now) {
        return 'Рывок: оглушение'
    }
    if (character.isActionLocked(now) && !canWalkDuringPrayer(character)) {
        return 'Действие выполняется'
    }
    const cooldown = character.movement.dashAvailableAt - now
    if (cooldown > 0) {
        return `Рывок: ещё ${String(Math.ceil(cooldown / 1000))} с.`
    }
    return character.energy < effectiveDashCost(character, now)
        ? 'Не хватает энергии'
        : 'Рывок сейчас недоступен'
}
