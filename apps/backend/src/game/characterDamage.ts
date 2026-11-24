import { HERO_REVIVAL_WINDOW_MS } from '@my-game-ratata/contracts'

import { clearAshExhaustion } from './ashExhaustion'
import { markAshExhaustionCastDamaged } from './ashExhaustionCast'
import { cancelAshTame } from './ashTaming'
import type { GameCharacter } from './character'
import { notifyCharacterDeath } from './characterDeathObservers'
import { clearCombatTransient } from './combatState'
import { resetMartyrStreak } from './martyr'
import { zeroVector } from './math'
import { clearResourcePractice } from './resourcePractice'

export function applyCharacterDamage(
    character: GameCharacter,
    amount: number,
    now: number
): void {
    if (!character.alive || character.trainingTarget !== undefined) {
        return
    }

    if (amount > 0) {
        markAshExhaustionCastDamaged(character)
        cancelAshTame(character)
        delete character.combat.combo
        character.interruptWork?.()
    }

    character.hp = Math.max(0, character.hp - amount)

    if (character.hp <= 0) {
        resetMartyrStreak(character)
        clearResourcePractice(character)
        character.deathSequence += 1
        character.alive = false
        clearAshExhaustion(character)
        clearCombatTransient(character, now)
        character.combat.stunImmuneUntil = 0
        notifyCharacterDeath(character)
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
