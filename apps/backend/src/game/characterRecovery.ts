import { clearAbilityEffects } from './abilityState'
import type { GameCharacter } from './character'
import { regen } from './characterState'
import { zeroVector } from './math'
import { createMovementState } from './movementActions'

export function tickCharacterTimedState(
    character: GameCharacter,
    now: number
): void {
    if (character.attackZoneUntil > 0 && now >= character.attackZoneUntil) {
        character.attackZones = []
        character.attackZoneUntil = 0
    }
    if (
        !character.mortal &&
        character.respawnPolicy === 'automatic' &&
        !character.alive &&
        character.respawnAt > 0 &&
        now >= character.respawnAt
    ) {
        restoreCharacter(character, now, true)
    }
}

export function restoreCharacter(
    character: GameCharacter,
    now: number,
    atSpawn: boolean
): void {
    const previousHp = character.hp
    const untrainableDamage = Math.min(
        character.abilities.untrainableHpDamage,
        character.maxHp - previousHp
    )
    clearAbilityEffects(character)
    character.alive = true
    character.movement = createMovementState()
    character.actionLockUntil = 0
    character.attackZones = []
    character.attackZoneUntil = 0
    character.animationUntil = 0
    character.clearPendingAttackHit()
    character.clearPath()
    character.setMoveInput(zeroVector())
    const fraction = atSpawn ? 1 : 0.5
    character.energy = character.config.resources.maxEnergy * fraction
    character.hp = Math.max(1, Math.ceil(character.maxHp * fraction))
    if (!atSpawn) {
        const healed = Math.max(0, character.hp - previousHp)
        character.abilities.untrainableHpDamage = Math.max(
            0,
            untrainableDamage - healed
        )
    }
    character.mana = character.config.resources.maxMana * fraction
    if (atSpawn) {
        character.locationId = character.spawnLocationId
        character.position = { ...character.spawnPosition }
    }
    character.respawnAt = 0
    character.reviveUntil = 0
    character.stunUntil = 0
    character.velocity = zeroVector()
    character.setAnimation('idle', now)
}

export function regenerateCharacter(
    character: GameCharacter,
    deltaMs: number,
    moving: boolean,
    energyAllowed = true
): void {
    if (!character.alive) {
        return
    }
    const resources = character.config.resources
    character.energy = regen(
        character.energy,
        resources.maxEnergy,
        energyAllowed
            ? moving
                ? resources.energyRegenMove
                : resources.energyRegenIdle
            : 0,
        deltaMs
    )
    character.mana = regen(
        character.mana,
        resources.maxMana,
        moving ? resources.manaRegenMove : resources.manaRegenIdle,
        deltaMs
    )
    character.hp = regen(
        character.hp,
        character.maxHp,
        moving
            ? character.config.hpRegenMovePerSec
            : character.config.hpRegenIdlePerSec,
        deltaMs
    )
}
