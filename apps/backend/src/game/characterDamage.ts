import { HERO_REVIVAL_WINDOW_MS } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { zeroVector } from './math'

export function applyCharacterDamage(
    character: GameCharacter,
    amount: number,
    now: number
): void {
    if (!character.alive || character.trainingTarget !== undefined) {
        return
    }

    if (amount > 0) {
        character.interruptWork?.()
    }

    character.hp = Math.max(0, character.hp - amount)

    if (character.hp <= 0) {
        character.deathSequence += 1
        character.alive = false
        character.reviveUntil = now + HERO_REVIVAL_WINDOW_MS
        character.actionLockUntil = 0
        character.setAnimation('death', now)
        character.clearPath()
        character.clearPendingAttackHit()
        character.setMoveInput(zeroVector())
        character.velocity = zeroVector()
        return
    }

    character.setAnimation('damaged', now, 300)
}
