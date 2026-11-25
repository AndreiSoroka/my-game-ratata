import { expect, type Locator } from '@playwright/test'

export const heroThemeCases = [
    {
        heroClass: 'vanguard',
        label: 'Авангард',
        border: 'border-012',
        borderWidth: 10,
        ability: 'Пусто',
    },
    {
        heroClass: 'ranger',
        label: 'Следопыт',
        border: 'border-017',
        borderWidth: 16,
        ability: 'Быстрый выстрел',
    },
    {
        heroClass: 'arcanist',
        label: 'Арканист',
        border: 'border-018',
        borderWidth: 14,
        ability: 'Искра',
    },
    {
        heroClass: 'cleric',
        label: 'Клирик',
        border: 'border-010',
        borderWidth: 10,
        ability: 'Молитва',
    },
] as const

export async function expectThemedBorder(
    border: Locator,
    variant: string,
    width: number
): Promise<string> {
    await expect(border).toHaveAttribute('data-fantasy-border', variant)
    await expect(border).toHaveCSS('border-top-width', `${width}px`)
    const artwork = await border.evaluate((element) => {
        const style = getComputedStyle(element, '::before')
        return { slice: style.borderImageSlice, width: style.borderImageWidth }
    })
    expect(artwork).toEqual({ slice: String(width), width: `${width}px` })
    const paint = border.locator(':scope > svg feFlood[result="border-color"]')
    return paint.evaluate((element) => getComputedStyle(element).floodColor)
}

const characterWindowAccents = {
    arcanist: 'rgb(174, 184, 198)',
    cleric: 'rgb(195, 185, 152)',
    vanguard: 'rgb(196, 180, 156)',
}

export async function expectCharacterWindowAppearance(
    window: Locator,
    { heroClass, label, border, borderWidth }: (typeof heroThemeCases)[number]
): Promise<void> {
    const background = window.getByRole('region', { name: 'Постоянные бонусы прошлого' })
    await expect(background).toContainText(`Прошлое: ${label}`)
    const windowFrame = window.locator(':scope > .game-frame--window')
    const insetFrame = background.locator(':scope > .game-frame--inset')
    if (heroClass === 'ranger') {
        const accent = await expectThemedBorder(
            windowFrame.locator('.game-frame__theme-border'),
            'border-014',
            10
        )
        expect(accent).toBe('rgb(198, 184, 155)')
        await expect(insetFrame.locator('.game-frame__theme-border')).toHaveCount(0)
        const appearance = await insetFrame.evaluate((element) => {
            const style = getComputedStyle(element, '::before')
            return { image: style.borderImageSource, width: style.borderImageWidth }
        })
        expect(appearance.image).toContain('tile_0008.png')
        expect(appearance.width).toBe('5px')
    } else {
        for (const frame of [windowFrame, insetFrame]) {
            const accent = await expectThemedBorder(
                frame.locator('.game-frame__theme-border'),
                border,
                borderWidth
            )
            expect(accent).toBe(characterWindowAccents[heroClass])
        }
    }

    const viewport = await window.evaluate(() => innerWidth)
    const title = window.locator('.character-header h2')
    await expect(title).toHaveCSS('font-family', /Pixelify Sans/)
    await expect(title).toHaveCSS('font-size', viewport <= 600 ? '19px' : '22px')
    const tabs = window.getByRole('tablist', { name: 'Разделы персонажа' }).getByRole('tab')
    await expect(tabs).toHaveCount(4)
    const rows = await tabs.evaluateAll(
        (items) => new Set(items.map((item) => item.getBoundingClientRect().top)).size
    )
    expect(rows).toBe(viewport <= 520 ? 2 : 1)
}
