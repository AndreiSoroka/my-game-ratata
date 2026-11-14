import type { CharacterSnapshot } from '@my-game-ratata/contracts'

import { snapshotAbilities } from './abilityState'
import type { GameCharacter } from './character'
import { snapshotControl } from './characterControl'
import { shouldRetireCharacter } from './characterLife'
import { resolveCharacterStats } from './characterStats'
import { snapshotEquipment, snapshotItem } from './inventory'
import { snapshotMovement } from './movementActions'
import { snapshotProgression } from './skillProgression'

export function createCharacterSnapshot(
    character: GameCharacter,
    now: number
): CharacterSnapshot {
    return {
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
        heroClass: character.heroClass ?? null,
        level: character.level,
        xp: character.xp,
        xpToNext: 0,
        progression: snapshotProgression(character, now),
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
        stats: resolveCharacterStats(
            character.config,
            character.equipment,
            character.progression.skills.swordsmanship.level
        ),
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
