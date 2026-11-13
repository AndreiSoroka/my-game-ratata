import type { CharacterArchetype, HeroClass } from '@my-game-ratata/contracts'

import { type CharacterConfig, getCharacterConfig } from './characterConfig'

export function createCharacterConfig(
    archetype: CharacterArchetype,
    heroClass: HeroClass | undefined
): CharacterConfig {
    const config = structuredClone(getCharacterConfig(archetype))
    if (heroClass !== undefined) {
        applyHeroClass(config, heroClass)
    }
    return config
}

function applyHeroClass(config: CharacterConfig, heroClass: HeroClass): void {
    switch (heroClass) {
        case 'vanguard':
            return
        case 'ranger':
            config.combat.maxHp = 24
            config.combat.minDamage = 4
            config.combat.maxDamage = 7
            config.combat.attackCooldownMs = 550
            config.moveSpeed = 110
            config.attackZones = [{ minX: -0.7, maxX: 0.7, minY: 0, maxY: 4 }]
            config.resources.attackEnergyCost = 10
            return
        case 'arcanist':
            config.combat.maxHp = 20
            config.combat.minDamage = 8
            config.combat.maxDamage = 13
            config.combat.attackCooldownMs = 800
            config.combat.attackWindupMs = 200
            config.attackZones = [{ minX: -1, maxX: 1, minY: 0, maxY: 5 }]
            config.resources.maxMana = 100
            config.resources.attackManaCost = 12
            config.resources.attackEnergyCost = 5
            return
        case 'cleric':
            config.combat.maxHp = 26
            config.combat.minDamage = 3
            config.combat.maxDamage = 6
            config.combat.attackCooldownMs = 700
            config.attackZones = [{ minX: -1, maxX: 1, minY: 0, maxY: 3 }]
            config.resources.maxMana = 120
            config.resources.attackManaCost = 6
            config.resources.attackEnergyCost = 5
    }
}
