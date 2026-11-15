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
            const otherId = await graph.evaluate((element) => {
                const stars = [
                    ...element.querySelectorAll('[role=button][aria-label="Неизвестно"]'),
                ]
                return stars
                    .find((star) => {
                        const rect = star.querySelector('.hit')!.getBoundingClientRect()
                        return (
                            document
                                .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
                                ?.closest('.constellation-node') === star
                        )
                    })
                    ?.getAttribute('data-node-id')
            })
            expect(otherId).toBeTruthy()
            await graph.locator(`[data-node-id="${otherId}"] .hit`).click()
            await expect(menu.getByLabel('Выбранная звезда')).toHaveText('Неизвестно')
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
