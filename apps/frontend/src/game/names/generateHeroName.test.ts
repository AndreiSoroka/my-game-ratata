import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateHeroName } from './generateHeroName'
import {
    HERO_GIVEN_NAMES,
    HERO_NAME_EPITHETS,
    HERO_NAME_POOLS,
    MAX_GENERATED_HERO_NAME_LENGTH,
} from './heroNameCatalog'

afterEach(() => vi.restoreAllMocks())

describe('local fantasy hero names', () => {
    it('defaults to Russian and treats a zero random draw as a valid first choice', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0)
        expect(generateHeroName()).toBe('Аэриан')
        expect(generateHeroName({ random: () => 0 })).toBe('Аэриан')
        expect(generateHeroName({ currentName: 'Аэриан', random: () => 0 })).toBe('Алион')
    })

    it.each([
        ['ru', 'Аэриан', 'Аэриан Янтарь'],
        ['ru-RU', 'Аэриан', 'Аэриан Янтарь'],
        ['en', 'Aerian', 'Aerian Amberglow'],
        [' EN-gb ', 'Aerian', 'Aerian Amberglow'],
        ['en_US', 'Aerian', 'Aerian Amberglow'],
        ['de', 'Аэриан', 'Аэриан Янтарь'],
        ['', 'Аэриан', 'Аэриан Янтарь'],
    ])('keeps both formats in the selected %s language', (language, short, long) => {
        expect(generateHeroName({ language, random: () => 0 })).toBe(short)
        const random = vi.fn<() => number>().mockReturnValueOnce(0.5).mockReturnValue(0)
        expect(generateHeroName({ language, random })).toBe(long)
        expect(random).toHaveBeenCalledTimes(2)
    })

    it.each(['ru', 'en'] as const)(
        'preserves a 50/50 format split in %s while excluding repeats',
        (language) => {
            const counts = { short: 0, withEpithet: 0 }
            for (let index = 0; index < 100; index += 1) {
                const format = index < 50 ? 'short' : 'withEpithet'
                const currentName = HERO_NAME_POOLS[language][format][0]
                const random = vi
                    .fn<() => number>()
                    .mockReturnValueOnce(index / 100)
                    .mockReturnValue(0)
                const name = generateHeroName({ language, currentName, random })
                expect(name).not.toBe(currentName)
                counts[name.includes(' ') ? 'withEpithet' : 'short'] += 1
                expect(random).toHaveBeenCalledTimes(2)
            }
            expect(counts).toEqual({ short: 50, withEpithet: 50 })
        }
    )

    it('excludes the current name after whitespace, case and Unicode normalization', () => {
        expect(generateHeroName({ currentName: '  аЭРИАН ', random: () => 0 })).toBe('Алион')
        const longRandom = vi.fn<() => number>().mockReturnValueOnce(0.75).mockReturnValue(0)
        expect(generateHeroName({ currentName: ' аэриан   янтарь ', random: longRandom })).toBe(
            'Аэриан Иней'
        )
        const short = HERO_NAME_POOLS.ru.short
        const index = short.indexOf('Бьёрн')
        const random = vi
            .fn<() => number>()
            .mockReturnValueOnce(0)
            .mockReturnValue((index + 0.1) / short.length)
        const name = generateHeroName({ currentName: 'Бьёрн'.normalize('NFD'), random })
        expect(name.normalize('NFC')).not.toBe('Бьёрн')
        expect(random).toHaveBeenCalledTimes(2)
    })
})

describe('reviewed name catalog boundaries', () => {
    it.each(['ru', 'en'] as const)(
        'contains only distinct complete %s candidates up to 24 JS characters',
        (language) => {
            const pools = HERO_NAME_POOLS[language]
            expect(pools.short).toHaveLength(48)
            for (const pool of [pools.short, pools.withEpithet]) {
                expect(pool.length).toBeGreaterThan(1)
                expect(new Set(pool).size).toBe(pool.length)
                expect(
                    pool.every(
                        (name) => name.length > 0 && name.length <= MAX_GENERATED_HERO_NAME_LENGTH
                    )
                ).toBe(true)
                expect(
                    pool.every((name) =>
                        language === 'ru'
                            ? /^[А-Яа-яЁё ]+$/u.test(name)
                            : /^[A-Za-z ]+$/u.test(name)
                    )
                ).toBe(true)
            }
            for (const name of pools.withEpithet) {
                const separator = name.indexOf(' ')
                expect(HERO_GIVEN_NAMES[language]).toContain(name.slice(0, separator))
                expect(HERO_NAME_EPITHETS[language]).toContain(name.slice(separator + 1))
            }
        }
    )

    it('includes exactly fitting names and omits oversized combinations without truncating them', () => {
        const exact = 'Evel Wandering Starlight'
        const oversized = 'Aerian Wandering Starlight'
        expect(exact.length).toBe(24)
        expect(HERO_NAME_POOLS.en.withEpithet).toContain(exact)
        expect(oversized.length).toBeGreaterThan(24)
        expect(HERO_NAME_POOLS.en.withEpithet).not.toContain(oversized)
        expect(HERO_NAME_POOLS.en.withEpithet).not.toContain(oversized.slice(0, 24))
    })

    it.each([NaN, Infinity, -Infinity, -1, 0])(
        'returns a bounded deterministic result for RNG %s',
        (draw) => {
            expect(generateHeroName({ random: () => draw })).toBe('Аэриан')
        }
    )

    it('supports the upper RNG boundary without an empty value or a retry loop', () => {
        const random = vi.fn<() => number>(() => 1)
        const name = generateHeroName({ language: 'en', random })
        expect(name).toBe(HERO_NAME_POOLS.en.withEpithet.at(-1))
        expect(name.length).toBeLessThanOrEqual(24)
        expect(random).toHaveBeenCalledTimes(2)
    })
})
