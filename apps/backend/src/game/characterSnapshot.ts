import type { CharacterSnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { resolveCharacterStats } from './characterStats'
import { snapshotEquipment, snapshotItem } from './inventory'

export function createCharacterSnapshot(
    character: GameCharacter,
    now: number
): CharacterSnapshot {
    return {
        alive: character.alive,
        animation: {
            action: character.animationAction,
            startedAt: character.animationStartedAt,
        },
        archetype: character.archetype,
        attackZones: character.attackZones,
        controllerKind: character.controllerKind,
        cooldowns: {
            attackMsLeft: Math.max(
                0,
                character.config.combat.attackCooldownMs -
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
        hp: Math.round(character.hp),
        id: character.id,
        inventory: character.inventory.map(snapshotItem),
        maxHp: character.maxHp,
        nickname: character.nickname,
        path: character.remainingPath(),
        position: character.position,
        reputation: character.reputation,
        resources: {
            energy: Math.round(character.energy),
            mana: Math.round(character.mana),
            maxEnergy: character.config.resources.maxEnergy,
            maxMana: character.config.resources.maxMana,
        },
        stats: resolveCharacterStats(character.config, character.equipment),
        tags: snapshotTags(character, now),
        velocity: character.velocity,
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
