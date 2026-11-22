import type {
    GameEventPayload,
    ResurrectionResources,
} from '@my-game-ratata/contracts'

import { clearAbilityEffects } from './abilityState'
import type { GameCharacter } from './character'
import { regen } from './characterState'
import { refreshCombatState } from './combatState'
import { constellationModifiers } from './constellationModifiers'
import { effectiveMaxEnergy, effectiveMaxMana } from './effectiveResources'
import { recordMartyrRecovery, resetMartyrStreak } from './martyr'
import { zeroVector } from './math'
import { createMovementState } from './movementActions'
import { clearPursuit } from './pursuitState'
import {
    clearResourcePractice,
    consumeResourceRecovery,
    restoreEnergy,
} from './resourcePractice'
import { recordVitalityRecovery, restBonusTime } from './vitalityPractice'

export function tickCharacterTimedState(
    character: GameCharacter,
    now: number
): void {
    refreshCombatState(character, now)
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
    resetMartyrStreak(character)
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
        restored?.energy ?? effectiveMaxEnergy(character) * fraction
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
    character.mana = restored?.mana ?? effectiveMaxMana(character) * fraction
    if (atSpawn) {
        character.locationId = character.spawnLocationId
        character.position = { ...character.spawnPosition }
    }
    character.respawnAt = 0
    character.reviveUntil = 0
    character.stunUntil = 0
    character.combat.stunImmuneUntil = 0
    character.velocity = zeroVector()
    character.setAnimation('idle', now)
}

export function regenerateCharacter(
    character: GameCharacter,
    deltaMs: number,
    moving: boolean,
    energyAllowed = true,
    now = 0,
    walking = moving && character.movement.mode === 'walking'
): GameEventPayload[] {
    if (!character.alive) {
        return []
    }
    const resources = character.config.resources
    const maxMana = effectiveMaxMana(character)
    const beforeMana = character.mana
    const energy =
        energyAllowed && !character.combat.defensiveStance
            ? recoverNaturalEnergy(character, deltaMs, moving, walking, now)
            : []
    character.mana = regen(
        character.mana,
        maxMana,
        moving ? resources.manaRegenMove : resources.manaRegenIdle,
        deltaMs
    )
    consumeResourceRecovery(
        character,
        'mana',
        character.mana - beforeMana,
        maxMana - beforeMana
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
    const events = recordVitalityRecovery(
        character,
        character.hp - beforeHp,
        now
    )
    recordMartyrRecovery(character)
    return [...energy, ...events]
}

function recoverNaturalEnergy(
    character: GameCharacter,
    deltaMs: number,
    moving: boolean,
    walking: boolean,
    now: number
): GameEventPayload[] {
    if (character.energy >= effectiveMaxEnergy(character)) {
        return []
    }
    const resources = character.config.resources
    const bonuses = constellationModifiers(character)
    const amount = moving
        ? resources.energyRegenMove *
          (walking ? bonuses.walkingEnergyRegenMultiplier : 1) *
          deltaMs
        : resources.energyRegenIdle *
          (bonuses.idleEnergyRegenMultiplier * deltaMs +
              bonuses.restEnergyRegenBonus *
                  restBonusTime(character, now, deltaMs))
    return restoreEnergy(character, amount / 1000, now).events
}
