import {
    type CharacterArchetype,
    HERO_BACKGROUND_DEFINITIONS,
    type HeroClass,
} from '@my-game-ratata/contracts'

import { type CharacterConfig, getCharacterConfig } from './characterConfig'

export function createCharacterConfig(
    archetype: CharacterArchetype,
    heroClass: HeroClass | undefined
): CharacterConfig {
    const config = structuredClone(getCharacterConfig(archetype))
    if (heroClass !== undefined) {
        const bonus = HERO_BACKGROUND_DEFINITIONS[heroClass].resourceBonus
        config.combat.maxHp += bonus.health
        config.resources.maxEnergy += bonus.energy
        config.resources.maxMana += bonus.mana
    }
    return config
}
