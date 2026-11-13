import { clearAbilityEffects } from './abilityState'
import type { GameCharacter } from './character'
import { regen } from './characterState'
import { zeroVector } from './math'
import { createMovementState } from './movementActions'

export function restoreCharacter(
    character: GameCharacter,
    now: number,
    atSpawn: boolean
): void {
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
