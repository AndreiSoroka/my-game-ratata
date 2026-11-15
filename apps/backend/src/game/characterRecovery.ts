import type {
    GameEventPayload,
    ResurrectionResources,
} from '@my-game-ratata/contracts'

import { clearAbilityEffects } from './abilityState'
import type { GameCharacter } from './character'
import { regen } from './characterState'
import { zeroVector } from './math'
import { createMovementState } from './movementActions'
import { clearPursuit } from './pursuitState'
import {
    clearResourcePractice,
    consumeResourceRecovery,
} from './resourcePractice'
import { recordVitalityRecovery } from './vitalityPractice'

export function tickCharacterTimedState(
    character: GameCharacter,
    now: number
): void {
    // Movement/timed-state runs before hit resolution, including ticks later than the deadline.
    if (
        character.pendingAttack === undefined &&
        character.attackZoneUntil > 0 &&
        now >= character.attackZoneUntil
    ) {
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
    atSpawn: boolean,
    resurrection?: ResurrectionResources
): void {
    const previousHp = character.hp
    const untrainableDamage = Math.min(
        character.abilities.untrainableHpDamage,
        Math.max(0, character.maxHp - previousHp)
    )
    clearAbilityEffects(character)
    clearResourcePractice(character)
    clearPursuit(character)
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
    const restored = atSpawn ? undefined : resurrection
    character.energy =
        restored?.energy ?? character.config.resources.maxEnergy * fraction
    character.hp =
        restored?.hp ?? Math.max(1, Math.ceil(character.maxHp * fraction))
    character.progression.constellations.lowHpFromHostile = false
    character.progression.constellations.lowHpAwarded = false
    character.progression.constellations.runicShotUntil = 0
    if (atSpawn) {
        character.progression.constellations.hostileWound = 0
    }
    if (!atSpawn) {
        const healed = Math.max(0, character.hp - previousHp)
        character.abilities.untrainableHpDamage = Math.max(
            0,
            untrainableDamage - healed
        )
    }
    character.mana =
        restored?.mana ?? character.config.resources.maxMana * fraction
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
    energyAllowed = true,
    now = 0
): GameEventPayload[] {
    if (!character.alive) {
        return []
    }
    const resources = character.config.resources
    const beforeEnergy = character.energy
    const beforeMana = character.mana
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
    consumeResourceRecovery(
        character,
        'energy',
        character.energy - beforeEnergy,
        resources.maxEnergy - beforeEnergy
    )
    consumeResourceRecovery(
        character,
        'mana',
        character.mana - beforeMana,
        resources.maxMana - beforeMana
    )
    const beforeHp = character.hp
    character.hp = regen(
        character.hp,
        character.maxHp,
        moving
            ? character.config.hpRegenMovePerSec
            : character.config.hpRegenIdlePerSec,
        deltaMs
    )
    return recordVitalityRecovery(character, character.hp - beforeHp, now)
}
