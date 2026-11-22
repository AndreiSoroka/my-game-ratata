import { expect, type Locator } from '@playwright/test'

export const heroThemeCases = [
    { heroClass: 'vanguard', label: 'Авангард', border: 'border-012', ability: 'Пусто' },
    { heroClass: 'ranger', label: 'Следопыт', border: 'border-017', ability: 'Выстрел' },
    { heroClass: 'arcanist', label: 'Арканист', border: 'border-018', ability: 'Искра' },
    { heroClass: 'cleric', label: 'Клирик', border: 'border-010', ability: 'Молитва' },
] as const

export async function expectThemedBorder(
    border: Locator,
    variant: string,
    width: number
): Promise<string> {
    await expect(border).toHaveAttribute('data-fantasy-border', variant)
    await expect(border).toHaveCSS('border-top-width', `${width}px`)
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
    { heroClass, label, border }: (typeof heroThemeCases)[number]
): Promise<void> {
    const background = window.getByRole('region', { name: 'Постоянные бонусы прошлого' })
    await expect(background).toContainText(`Прошлое: ${label}`)
    const frames = [
        {
            frame: window.locator(':scope > .game-frame--window'),
            width: 9,
            legacy: 'tile_0009.png',
        },
        {
            frame: background.locator(':scope > .game-frame--inset'),
            width: 5,
            legacy: 'tile_0008.png',
        },
    ]
    for (const { frame, width, legacy } of frames) {
        const themed = frame.locator('.game-frame__theme-border')
        if (heroClass === 'ranger') {
            await expect(themed).toHaveCount(0)
            const appearance = await frame.evaluate((element) => {
                const style = getComputedStyle(element, '::before')
                return { image: style.borderImageSource, width: style.borderImageWidth }
            })
            expect(appearance.image).toContain(legacy)
            expect(appearance.width).toBe(`${width}px`)
        } else {
            const accent = await expectThemedBorder(themed, border, width)
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
    expect(rows).toBe(viewport <= 420 ? 2 : 1)
}
