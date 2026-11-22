import { type HeroClass, heroClasses } from '@my-game-ratata/contracts'

export function parseStoryHeroClass(value: unknown): HeroClass | undefined {
    return heroClasses.find((heroClass) => heroClass === value)
}
