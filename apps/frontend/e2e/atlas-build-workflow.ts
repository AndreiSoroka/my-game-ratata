import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'

export async function selectBuildStar(page: Page, id: string): Promise<void> {
    await page.getByTestId('debug-search').fill(id)
    await page.getByTestId('debug-star-list').locator(`[data-star-id="${id}"]`).click()
}
export function buildMetric(page: Page, label: string): Locator {
    return page.locator(`[data-build-metric="${label}"] dd`)
}
async function clickStar(page: Page, id: string): Promise<void> {
    await selectBuildStar(page, id)
    const graph = page.getByRole('group', { name: 'Созвездия развития' })
    await graph.scrollIntoViewIfNeeded()
    await graph.locator(`[data-node-id="${id}"] .hit`).click()
}
async function inspectPrayer(page: Page): Promise<void> {
    await selectBuildStar(page, 'prayer.root')
    await page.getByTestId('debug-show-summary').click()
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
    const coordinates = await graph
        .locator('[data-node-id]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')))
    await count(page, 1)
    await expect(graph.locator('[data-enabled="true"]')).toHaveCount(1)
    await expect(graph.locator('[data-node-id="prayer.harm"]')).toHaveAttribute(
        'data-enabled',
        'false'
    )
    await selectBuildStar(page, 'prayer.harm')
    await count(page, 1)
    await expect(page.getByTestId('selected-star-toggle')).toHaveAttribute('aria-checked', 'false')
    await clickStar(page, 'prayer.harm')
    await count(page, 2)
    await inspectPrayer(page)
    await expect(page.getByTestId('debug-prayer-build-effects')).toContainText('Кара')
    await expect(buildMetric(page, 'Урон кары')).toContainText('6 HP')
    await expect(page.locator('[data-metric="Кара (если изучена)"]')).toHaveCount(0)
    await clickStar(page, 'prayer.root')
    await count(page, 2)
    await inspectPrayer(page)
    await page.getByTestId('debug-search').fill('prayer.harm2')
    await page.locator('[data-star-toggle="prayer.harm2"]').click()
    const blocked = page.getByTestId('debug-build-blocked')
    await expect(blocked).toContainText('Нужно открыть «Суровый ответ»')
    await expect(blocked).toBeInViewport()
    await count(page, 2)
    await page.screenshot({ path: info.outputPath(`builder-blocked-${width}.png`), fullPage: true })
    await page.locator('[data-find-parent="prayer.harm1"]').click()
    await expect(page.getByTestId('selected-star-card').getByRole('heading')).toHaveText(
        'Суровый ответ'
    )
    await count(page, 2)
    await page.getByTestId('selected-star-toggle').click()
    await count(page, 3)
    await inspectPrayer(page)
    await expect(buildMetric(page, 'Множитель кары')).toHaveText('×1,3')
    await expect(buildMetric(page, 'Урон кары')).toContainText('8 HP')
    await clickStar(page, 'prayer.harm2')
    await count(page, 4)
    await clickStar(page, 'prayer.root')
    await count(page, 4)
    await page.getByTestId('debug-show-summary').click()
    await expect(buildMetric(page, 'Множитель кары')).toHaveText('×1,6')
    await expect(buildMetric(page, 'Урон кары')).toContainText('10 HP')
    await expect(page.getByTestId('debug-prayer-faith')).toHaveValue('1')
    await expect(page.getByTestId('debug-prayer-miracles')).toHaveValue('1')
    expect(
        await graph
            .locator('[data-node-id]')
            .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')))
    ).toEqual(coordinates)
    await page.screenshot({ path: info.outputPath(`builder-prayer-${width}.png`), fullPage: true })
    await selectBuildStar(page, 'prayer.harm')
    await page.getByTestId('selected-star-toggle').click()
    await count(page, 1)
    const cascade = page.getByTestId('debug-build-cascade')
    await expect(cascade).toContainText('Отключено звёзд: 3')
    await expect(cascade).toContainText('Кара')
    await expect(cascade).toContainText('Суровый ответ')
    await expect(cascade).toContainText('Гнев небес')
    await selectBuildStar(page, 'prayer.root')
    await expect(cascade).toContainText('Суровый ответ')
    await expect(buildMetric(page, 'Урон кары')).toHaveCount(0)
    await page.screenshot({ path: info.outputPath(`builder-cascade-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Скрыть список отключённых звёзд' }).click()
    await assertRunicBuild(page)
    await page.getByTestId('debug-build-reset').click()
    await count(page, 1)
    await page.getByRole('button', { name: 'Скрыть список отключённых звёзд' }).click()
    await selectBuildStar(page, 'prayer.root')
    await page.getByTestId('debug-search').fill('')
}
async function assertRunicBuild(page: Page): Promise<void> {
    await page.getByTestId('debug-build-all').click()
    await count(page, 77)
    await selectBuildStar(page, 'arrow.root')
    await page.getByTestId('debug-show-summary').click()
    await expect(buildMetric(page, 'Итоговый множитель урона Выстрела')).toHaveText('×1,2')
    await page.getByTestId('debug-runic-charged').check()
    await expect(buildMetric(page, 'Итоговый множитель урона Выстрела')).toHaveText('×1,32')
    await selectBuildStar(page, 'magic.root')
    await expect(buildMetric(page, 'Урон Выстрела с учётом всей сборки')).toHaveText('×1,32')
    await expect(buildMetric(page, 'Запас поглощения Барьера')).toHaveText('10')
}
