import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canWalkDuringPrayer } from './combatMovement'
import { recordChainsMovementBlock } from './magicPractice'
import {
    cancelMagicChannel,
    magicBlocksMovement,
    magicChannelFor,
} from './magicState'
import { zeroVector } from './math'

export function haltMagicMovement(
    character: GameCharacter,
    now: number,
    onEvents?: (events: GameEventPayload[]) => void
): boolean {
    const intendedMove = hasMovementIntent(character)
    if (magicChannelFor(character) !== undefined && intendedMove) {
        const events = cancelMagicChannel(character, now)
        onEvents?.(events)
    }
    if (!magicBlocksMovement(character, now)) {
        return false
    }
    const couldMove =
        character.combat.lunge !== undefined ||
        (!character.combat.defensiveStance &&
            (!character.isActionLocked(now) ||
                canWalkDuringPrayer(character)) &&
            (intendedMove || character.movement.dashUntil > now))
    if (couldMove) {
        const events = recordChainsMovementBlock(character, now)
        onEvents?.(events)
    }
    character.velocity = zeroVector()
    character.movement.dashUntil = 0
    delete character.combat.lunge
    return true
}

function hasMovementIntent(character: GameCharacter): boolean {
    const { x, y } = character.getMoveInput()
    return character.hasPath() || x !== 0 || y !== 0
}
