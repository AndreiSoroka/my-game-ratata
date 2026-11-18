import { HERO_NAME_POOLS, type HeroNameLanguage } from './heroNameCatalog'

export interface HeroNameOptions {
    language?: string
    currentName?: string
    random?: () => number
}

/** Offline selection: choose the format once, then exclude the current name within that format. */
export function generateHeroName({
    language = 'ru',
    currentName = '',
    random = Math.random,
}: HeroNameOptions = {}): string {
    const locale: HeroNameLanguage =
        language.trim().toLowerCase().split(/[-_]/u)[0] === 'en' ? 'en' : 'ru'
    const format = sample(random) < 0.5 ? 'short' : 'withEpithet'
    const current = nameKey(currentName)
    const available = HERO_NAME_POOLS[locale][format].filter((name) => nameKey(name) !== current)
    const chosen = available[Math.floor(sample(random) * available.length)]
    if (chosen === undefined) {
        throw new Error('The authored hero name pool must contain distinct alternatives')
    }
    return chosen
}

function nameKey(value: string): string {
    return value.trim().replace(/\s+/gu, ' ').normalize('NFC').toLowerCase()
}

/** Injected RNGs may return a boundary or invalid value; zero is always a valid first choice. */
function sample(random: () => number): number {
    const value = random()
    return Number.isFinite(value) ? Math.min(1 - Number.EPSILON, Math.max(0, value)) : 0
}
