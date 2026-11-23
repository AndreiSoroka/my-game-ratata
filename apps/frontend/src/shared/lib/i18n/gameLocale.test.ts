import { afterEach, describe, expect, it, vi } from 'vitest'

import { gameI18n, gameLocale, initializeGameLocale, itemName, setGameLocale, tGame } from './index'

afterEach(() => {
    setGameLocale('ru')
    localStorage.removeItem('ratata.locale')
})

describe('game locale', () => {
    it('restores the selected language and updates the document and catalogs live', () => {
        initializeGameLocale()
        expect(gameLocale.value).toBe('ru')
        expect(itemName('food')).toBe('Яблоко')

        setGameLocale('en')
        initializeGameLocale()
        expect(document.documentElement.lang).toBe('en')
        expect(document.title).toBe('Ratata — Lands of Novogorod')
        expect(itemName('food')).toBe('Apple')
    })

    it('selects the three Russian plural forms and the two English forms', () => {
        expect(tGame('game.join.locations', 21)).toBe('21 локация')
        expect(tGame('game.join.locations', 23)).toBe('23 локации')
        expect(tGame('game.join.locations', 11)).toBe('11 локаций')
        setGameLocale('en')
        expect(tGame('game.join.locations', 1)).toBe('1 location')
        expect(tGame('game.join.locations', 2)).toBe('2 locations')
    })

    it('compiles every translation with parameters and pairs both locales by key', () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
        try {
            const composer = gameI18n.global
            const russian = leafMessages(composer.getLocaleMessage('ru'))
            const english = leafMessages(composer.getLocaleMessage('en'))
            expect([...english.keys()].sort()).toEqual([...russian.keys()].sort())
            for (const [key, original] of russian) {
                const translated = english.get(key)!
                const names = [
                    ...new Set([
                        ...interpolationNames(original),
                        ...interpolationNames(translated),
                    ]),
                ]
                const params = Object.fromEntries(names.map((name) => [name, 2]))
                for (const locale of ['ru', 'en'] as const) {
                    const result = composer.t(key, params, { locale })
                    expect(result, `${locale} ${key}`).not.toBe(key)
                }
            }
            expect(errors.mock.calls).toEqual([])
        } finally {
            errors.mockRestore()
        }
    })
})

function leafMessages(value: object, prefix = '', result = new Map<string, string>()) {
    for (const [key, entry] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key
        if (typeof entry === 'string') result.set(path, entry)
        else if (entry !== null && typeof entry === 'object')
            leafMessages(entry as object, path, result)
    }
    return result
}

function interpolationNames(text: string): string[] {
    return [
        ...new Set([...text.matchAll(/\{([a-z][a-z0-9_]*)\}/giu)].map((match) => match[1]!)),
    ].sort()
}
