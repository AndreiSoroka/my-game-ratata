import { expect, type Locator, test } from '@playwright/test'

const heroes = [
    { story: 'vanguard-development', root: 'Клинок' },
    { story: 'arcanist-development', root: 'Магия' },
    { story: 'development', root: 'Молитва' },
    { story: 'ranger-development', root: 'Стрела' },
]
for (const width of [320, 390, 1280]) {
    for (const hero of heroes) {
        test(`${hero.root} personal sky centers and resets at ${width}px`, async ({
            page,
        }, info) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto(`/iframe.html?id=interface-character--${hero.story}&viewMode=story`)
            const menu = page.getByRole('dialog', { name: 'Персонаж', exact: true })
            const graph = menu.getByRole('group', { name: 'Созвездия развития' })
            await expect(graph).toBeVisible()
            await expect(menu.getByLabel('Выбранная звезда').getByRole('heading')).toHaveText(
                hero.root
            )
            await expect.poll(() => centeringError(graph, hero.root)).toBeLessThan(0.5)
            const initial = await graph.getAttribute('viewBox')
            await expectUnknownStarsInert(graph)
            const root = graph.getByRole('button', { name: hero.root, exact: true })
            await root.locator('.hit').click()
            await expect(root).toBeFocused()
            await expect(graph).not.toHaveAttribute('viewBox', initial!)
            await expect(menu.getByLabel('Выбранная звезда').getByRole('heading')).toHaveText(
                hero.root
            )
            await root.press('ArrowRight')
            await expect(menu.getByLabel('Выбранная звезда').getByRole('heading')).not.toHaveText(
                'Неизвестно'
            )
            await expectUnknownStarsInert(graph)
            await menu.getByRole('button', { name: 'Показать весь небосвод' }).click()
            await expect.poll(() => centeringError(graph, hero.root)).toBeLessThan(0.5)
            await expect(graph).toHaveAttribute('viewBox', initial!)
            await expect(menu.getByLabel('Выбранная звезда').getByRole('heading')).toHaveText(
                hero.root
            )
            await page.screenshot({
                path: info.outputPath(`personal-sky-${hero.story}-${width}.png`),
            })
        })
    }
}

async function expectUnknownStarsInert(graph: Locator): Promise<void> {
    const unknown = graph.locator('.constellation-node.closed')
    await expect(unknown.first()).toBeAttached()
    await expect(graph.locator('.closed[role]')).toHaveCount(0)
    await expect(graph.locator('.closed[tabindex]')).toHaveCount(0)
    await expect(graph.locator('.closed:not([aria-hidden="true"])')).toHaveCount(0)
    await expect(graph.locator('.closed.selected')).toHaveCount(0)
    await expect(unknown.first()).toHaveCSS('cursor', 'default')
    await expect(unknown.first().locator('.hit')).toHaveCSS('pointer-events', 'none')
}

async function centeringError(graph: Locator, root: string): Promise<number> {
    const frame = await graph.boundingBox()
    const star = await graph
        .getByRole('button', { name: root, exact: true })
        .locator('.hit')
        .boundingBox()
    if (!frame || !star) return Infinity
    return Math.max(
        Math.abs(star.x + star.width / 2 - frame.x - frame.width / 2),
        Math.abs(star.y + star.height / 2 - frame.y - frame.height / 2)
    )
}
