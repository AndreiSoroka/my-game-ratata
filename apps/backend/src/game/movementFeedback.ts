import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
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
            actorId: character.id,
            audienceIds: [character.id],
            text,
        },
    ]
}

function dashReason(character: GameCharacter, now: number): string {
    if (character.stunUntil > now) {
        return 'Рывок недоступен: персонаж оглушён.'
    }
    if (character.isActionLocked(now)) {
        return 'Дождись окончания действия, чтобы сделать рывок.'
    }
    const cooldown = character.movement.dashAvailableAt - now
    if (cooldown > 0) {
        return `Рывок восстанавливается: ещё ${String(Math.ceil(cooldown / 1000))} с.`
    }
    return `Для рывка нужно ${String(effectiveDashCost(character))} энергии. Недостаточно сил.`
}
