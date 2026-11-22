import type {
    CharacterSnapshot,
    CharacterStatsSnapshot,
} from '@my-game-ratata/contracts'

import { snapshotAbilities } from './abilityState'
import type { GameCharacter } from './character'
import { snapshotControl } from './characterControl'
import { shouldRetireCharacter } from './characterLife'
import { constellationModifiers } from './constellationModifiers'
import { effectiveCharacterStats } from './effectiveParameters'
import { effectiveMaxEnergy, effectiveMaxMana } from './effectiveResources'
import { snapshotEquipment, snapshotItem } from './inventory'
import { snapshotMovement } from './movementActions'
import { snapshotProgression } from './progressionObservation'

export function createCharacterSnapshot(
    character: GameCharacter,
    now: number,
    includePrivate = true
): CharacterSnapshot & { stats: CharacterStatsSnapshot } {
    return {
        ...(character.trainingTarget === undefined
            ? {}
            : { trainingTarget: { ...character.trainingTarget } }),
        combat: snapshotCombat(character, now, includePrivate),
        control: snapshotControl(character),
        creatureType: character.creatureType,
        alive: character.alive,
        basicAttackKind: character.config.basicAttackKind,
        abilities: snapshotAbilities(character, now),
        movement: snapshotMovement(character, now),
        animation: snapshotAnimation(character),
        archetype: character.archetype,
        attackZones: character.attackZones,
        controllerKind: character.controllerKind,
        connected: character.connected,
        cooldowns: snapshotCooldowns(character, now),
        equipment: snapshotEquipment(character.equipment),
        facing: character.facing,
        faction: character.faction,
        health: { kind: 'exact', current: character.hp, max: character.maxHp },
        heroClass: character.heroClass ?? null,
        level: character.level,
        xp: character.xp,
        xpToNext: 0,
        progression: snapshotProgression(character, now, includePrivate),
        soul: {
            canSpeak: character.soul.canSpeak,
            controlSource: character.soul.controlSource,
            kind: character.soul.kind,
        },
        life: {
            retired:
                character.tags.has('state.retired') ||
                shouldRetireCharacter(character, now),
            reviveMsLeft: character.alive
                ? 0
                : Math.max(0, character.reviveUntil - now),
            reviveUntil: character.reviveUntil,
        },
        id: character.id,
        inventory: character.inventory.map(snapshotItem),
        nickname: character.nickname,
        path: character.remainingPath(),
        position: character.position,
        reputation: character.reputation,
        resources: {
            energy: {
                kind: 'exact',
                current: character.energy,
                max: effectiveMaxEnergy(character),
            },
            mana: {
                kind: 'exact',
                current: character.mana,
                max: effectiveMaxMana(character),
            },
        },
        stats: effectiveCharacterStats(character),
        tags: snapshotTags(character, now),
        velocity: character.velocity,
        visualId:
            character.visualId === 'skeleton' &&
            character.equipment.weapon === undefined
                ? 'skeleton_swordless'
                : character.visualId,
    }
}

function snapshotTags(character: GameCharacter, now: number): string[] {
    const tags = [...character.tags]

    if (!character.alive) {
        tags.push('state.dead')
    }

    if (character.stunUntil > now) {
        tags.push('state.cc.stunned')
    }

    return tags
}

function snapshotCombat(
    character: GameCharacter,
    now: number,
    includePrivate: boolean
) {
    const state = character.combat
    return {
        defensiveStance: state.defensiveStance,
        ...(state.action === undefined
            ? {}
            : { action: structuredClone(state.action) }),
        ...(includePrivate &&
        state.combo !== undefined &&
        state.combo.expiresAt > now
            ? {
                  combo: {
                      stacks: state.combo.stacks,
                      limit: constellationModifiers(character).bladeComboLimit,
                      expiresAt: state.combo.expiresAt,
                  },
              }
            : {}),
    }
}

function snapshotAnimation(
    character: GameCharacter
): CharacterSnapshot['animation'] {
    return {
        action: character.animationAction,
        startedAt: character.animationStartedAt,
        ...(character.combat.action === undefined
            ? {}
            : {
                  durationMs:
                      character.combat.action.readyAt -
                      character.combat.action.startedAt,
                  hitAt: character.combat.action.hitAt,
                  movementAt: character.combat.action.movementAt,
              }),
    }
}

function snapshotCooldowns(
    character: GameCharacter,
    now: number
): CharacterSnapshot['cooldowns'] {
    return {
        attackMsLeft: Math.max(0, character.combat.readyAt - now),
        respawnMsLeft: character.alive
            ? 0
            : Math.max(0, character.respawnAt - now),
        stunMsLeft: Math.max(0, character.stunUntil - now),
    }
}
