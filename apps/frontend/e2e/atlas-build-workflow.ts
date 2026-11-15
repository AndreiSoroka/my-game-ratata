import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'

export async function selectBuildStar(page: Page, id: string): Promise<void> {
    await page.getByTestId('debug-search').fill(id)
    await page.locator(`[data-star-id="${id}"]`).click()
}
export function buildMetric(page: Page, label: string): Locator {
    return page.locator(`[data-build-metric="${label}"] dd`)
}
async function spaceStar(page: Page, id: string): Promise<void> {
    await selectBuildStar(page, id)
    const graph = page.getByRole('group', { name: 'Созвездия развития' })
    await graph.scrollIntoViewIfNeeded()
    const star = graph.locator(`[data-node-id="${id}"]`)
    await star.locator('.hit').click()
    await expect(star).toBeFocused()
    await star.press('Space')
}
async function count(page: Page, value: number): Promise<void> {
    await expect(page.getByTestId('debug-build-count').locator('strong')).toHaveText(String(value))
}
export async function assertBuildWorkflow(
    page: Page,
    width: number,
    info: TestInfo
): Promise<void> {
    const graph = page.getByRole('group', { name: 'Созвездия развития' })
    const initialCoordinates = await graph
        .locator('[data-node-id]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')))
    await count(page, 2)
    await expect(graph.locator('[data-node-id="prayer.revive"]')).toHaveAttribute(
        'data-enabled',
        'true'
    )
    await expect(page.getByTestId('debug-mastery-level')).toHaveText('0')
    await expect(page.getByTestId('debug-prayer-faith')).toHaveCount(0)
    await expect(page.getByTestId('debug-prayer-miracles')).toHaveCount(0)
    await expect(page.locator('[data-metric="Отказ божества"]')).toHaveCount(0)
    await expect(page.locator('[data-metric="Шанс лечения"] dd')).toHaveText('55%')
    await expect(page.locator('[data-metric="Шанс очищения могилы"] dd')).toHaveText('20% за шаг')
    await expect(page.locator('[data-metric="Шанс воскрешения"] dd')).toHaveText('55%')
    expect(await page.getByTestId('debug-effect-chance').getAttribute('open')).toBeNull()
    expect(await page.getByTestId('debug-unlock-conditions').getAttribute('open')).toBeNull()
    await selectBuildStar(page, 'prayer.harm')
    const kara = graph.locator('[data-node-id="prayer.harm"]')
    await graph.scrollIntoViewIfNeeded()
    await kara.locator('.hit').click()
    await count(page, 2)
    await expect(kara).toBeFocused()
    await kara.press('Enter')
    await count(page, 2)
    await kara.press('Space')
    await count(page, 3)
    await expect(page.getByTestId('debug-mastery-level')).toHaveText('1')
    await expect(page.getByTestId('debug-mastery-total')).toHaveText('100 XP')
    await selectBuildStar(page, 'prayer.root')
    await expect(page.locator('[data-metric="Шанс кары"] dd')).toHaveText('75%')
    await expect(buildMetric(page, 'Урон кары')).toContainText('6 HP')
    await selectBuildStar(page, 'prayer.harm2')
    await page.getByTestId('selected-star-toggle').click()
    const blocked = page.getByTestId('debug-build-blocked')
    await expect(blocked).toContainText('Суровый ответ')
    await expect(blocked).toBeInViewport()
    await count(page, 3)
    await page.screenshot({ path: info.outputPath(`mastery-blocked-${width}.png`), fullPage: true })
    await page.locator('[data-find-parent="prayer.harm1"]').click()
    await count(page, 3)
    await page.getByTestId('selected-star-toggle').click()
    await count(page, 4)
    await expect(page.getByTestId('debug-mastery-level')).toHaveText('3')
    await spaceStar(page, 'prayer.harm2')
    await count(page, 5)
    await expect(page.getByTestId('debug-mastery-level')).toHaveText('5')
    await expect(page.getByTestId('debug-mastery-total')).toHaveText(/1\s200 XP/)
    await expect(page.getByTestId('debug-mastery-pending')).toContainText('2')
    await expect(page.getByTestId('debug-mastery-next')).toHaveText('27 действий · 0 / 800 XP')
    await selectBuildStar(page, 'prayer.root')
    await expect(buildMetric(page, 'Множитель кары')).toHaveText('×1,6')
    await expect(buildMetric(page, 'Урон кары')).toContainText('10 HP')
    await page.getByTestId('debug-prayer-mood').selectOption('benevolent')
    await expect(page.locator('[data-metric="Шанс лечения"] dd')).toHaveText('80%')
    await expect(page.locator('[data-metric="Шанс кары"] dd')).toHaveText('95%')
    await page.getByTestId('debug-prayer-mood').selectOption('neutral')
    await page.screenshot({ path: info.outputPath(`mastery-build-${width}.png`), fullPage: true })
    await spaceStar(page, 'prayer.harm')
    await count(page, 2)
    await expect(page.getByTestId('debug-build-cascade')).toContainText('Отключено звёзд: 3')
    await expect(page.getByTestId('debug-build-cascade')).toContainText('Гнев небес')
    await selectBuildStar(page, 'prayer.root')
    await expect(page.locator('[data-metric="Шанс кары"]')).toHaveCount(0)
    expect(
        await graph
            .locator('[data-node-id]')
            .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')))
    ).toEqual(initialCoordinates)
    await page.getByRole('button', { name: 'Скрыть список отключённых звёзд' }).click()
    await page.getByTestId('debug-build-reset').click()
    await page.getByTestId('debug-search').fill('')
}
