import type {
    CharacterSnapshot,
    CharacterStatsSnapshot,
} from '@my-game-ratata/contracts'

import { snapshotAbilities } from './abilityState'
import type { GameCharacter } from './character'
import { snapshotControl } from './characterControl'
import { shouldRetireCharacter } from './characterLife'
import {
    effectiveAttackCooldown,
    effectiveCharacterStats,
} from './effectiveParameters'
import { effectiveMaxMana } from './effectiveResources'
import { snapshotEquipment, snapshotItem } from './inventory'
import { snapshotMovement } from './movementActions'
import { snapshotProgression } from './skillProgression'

export function createCharacterSnapshot(
    character: GameCharacter,
    now: number,
    includePrivate = true
): CharacterSnapshot & { stats: CharacterStatsSnapshot } {
    return {
        ...(character.trainingTarget === undefined
            ? {}
            : { trainingTarget: { ...character.trainingTarget } }),
        control: snapshotControl(character),
        creatureType: character.creatureType,
        alive: character.alive,
        basicAttackKind: character.config.basicAttackKind,
        abilities: snapshotAbilities(character, now),
        movement: snapshotMovement(character, now),
        animation: {
            action: character.animationAction,
            startedAt: character.animationStartedAt,
        },
        archetype: character.archetype,
        attackZones: character.attackZones,
        controllerKind: character.controllerKind,
        connected: character.connected,
        cooldowns: {
            attackMsLeft: Math.max(
                0,
                effectiveAttackCooldown(character) -
                    (now - character.lastAttackAt)
            ),
            respawnMsLeft: character.alive
                ? 0
                : Math.max(0, character.respawnAt - now),
            stunMsLeft: Math.max(0, character.stunUntil - now),
        },
        equipment: snapshotEquipment(character.equipment),
        facing: character.facing,
        faction: character.faction,
        health: { kind: 'exact', current: character.hp, max: character.maxHp },
        heroClass: character.heroClass ?? null,
        level: character.level,
        xp: character.xp,
        xpToNext: 0,
        progression: snapshotProgression(character, now, includePrivate),
        soul: character.soul,
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
                max: character.config.resources.maxEnergy,
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
        visualId: character.visualId,
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
