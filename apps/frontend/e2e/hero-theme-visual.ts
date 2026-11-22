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
