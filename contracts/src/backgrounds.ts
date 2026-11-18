import type { ConstellationId } from './development'
import type { HeroClass } from './life'
import { masteryRewardMicros } from './mastery'

export interface BackgroundResources {
    health: number
    energy: number
    mana: number
}

export interface HeroBackgroundDefinition {
    id: HeroClass
    name: string
    description: string
    resourceBonus: Readonly<BackgroundResources>
    masteryIds: readonly ConstellationId[]
}

/** Starting resources precede any percentage modifiers learned from constellations. */
export const HUMAN_BASE_RESOURCES: Readonly<BackgroundResources> =
    Object.freeze({
        health: 30,
        energy: 100,
        mana: 40,
    })
export const BACKGROUND_MASTERY_MULTIPLIER = 1.2

export const HERO_BACKGROUND_DEFINITIONS: Readonly<
    Record<HeroClass, HeroBackgroundDefinition>
> = Object.freeze({
    vanguard: {
        id: 'vanguard',
        name: 'Авангард',
        description: 'Опыт передовой: крепкое тело и первые знания Клинка.',
        resourceBonus: { health: 20, energy: 20, mana: 0 },
        masteryIds: ['blade'],
    },
    ranger: {
        id: 'ranger',
        name: 'Следопыт',
        description: 'Опыт странствий: запас сил и первые знания Стрелы.',
        resourceBonus: { health: 10, energy: 20, mana: 0 },
        masteryIds: ['arrow'],
    },
    arcanist: {
        id: 'arcanist',
        name: 'Арканист',
        description: 'Опыт изучения чар: запас маны и первые знания Магии.',
        resourceBonus: { health: 0, energy: 0, mana: 30 },
        masteryIds: ['magic'],
    },
    cleric: {
        id: 'cleric',
        name: 'Клирик',
        description: 'Опыт служения: молитва и возвращение павших товарищей.',
        resourceBonus: { health: 0, energy: 0, mana: 0 },
        masteryIds: ['prayer', 'prayer_road', 'prayer_lantern', 'prayer_grave'],
    },
})

export function backgroundResources(
    heroClass?: HeroClass
): BackgroundResources {
    const bonus =
        heroClass === undefined
            ? { health: 0, energy: 0, mana: 0 }
            : HERO_BACKGROUND_DEFINITIONS[heroClass].resourceBonus
    return {
        health: HUMAN_BASE_RESOURCES.health + bonus.health,
        energy: HUMAN_BASE_RESOURCES.energy + bonus.energy,
        mana: HUMAN_BASE_RESOURCES.mana + bonus.mana,
    }
}

export function backgroundMasteryMultiplier(
    heroClass: HeroClass | undefined,
    constellationId: ConstellationId
): number {
    return heroClass !== undefined &&
        HERO_BACKGROUND_DEFINITIONS[heroClass].masteryIds.includes(
            constellationId
        )
        ? BACKGROUND_MASTERY_MULTIPLIER
        : 1
}

/** Round once after applying the background bonus and the independent conflict factor. */
export function backgroundMasteryRewardMicros(
    base: number,
    conflict: number,
    heroClass: HeroClass | undefined,
    constellationId: ConstellationId
): bigint {
    return masteryRewardMicros(
        base * backgroundMasteryMultiplier(heroClass, constellationId),
        conflict
    )
}
