import { expect, type Locator, type Page } from '@playwright/test'

export function selectedWorldTarget(page: Page): Locator {
    return page.locator('.hotbar[data-selected-target-key]')
}

export async function clickVisibleCharacter(
    page: Page,
    id: string,
    clickCount: 1 | 2
): Promise<void> {
    await page.bringToFront()
    const point = await page.evaluate((targetId) => {
        const target = window.__ratataTest!.observe().targets.find(({ id }) => id === targetId)
        return target && window.__ratataGameDebug?.worldToPage(target.position)
    }, id)
    expect(point).toBeDefined()
    await page.mouse.click(point!.x, point!.y, { clickCount })
}
