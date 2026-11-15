import { type HeroClass, heroClasses } from '@my-game-ratata/contracts'

export interface ConstellationDebugSettings {
    heroClass: HeroClass
    seed: string
}
export const debugHeroClasses: { id: HeroClass; name: string }[] = [
    { id: 'cleric', name: 'Клерик' },
    { id: 'arcanist', name: 'Маг' },
    { id: 'vanguard', name: 'Воин' },
    { id: 'ranger', name: 'Лучник' },
]
export function readConstellationDebugSettings(url: URL): ConstellationDebugSettings {
    const heroClass = url.searchParams.get('class')
    return {
        heroClass: heroClasses.find((id) => id === heroClass) ?? 'cleric',
        seed: url.searchParams.get('seed')?.trim().slice(0, 128) || 'cleric-demo',
    }
}
export function writeConstellationDebugSettings(settings: ConstellationDebugSettings): void {
    const url = new URL(window.location.href)
    url.searchParams.set('debug', 'constellations')
    url.searchParams.set('class', settings.heroClass)
    url.searchParams.set('seed', settings.seed)
    window.history.replaceState(window.history.state, '', url)
}
