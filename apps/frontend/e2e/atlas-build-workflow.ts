import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'

export async function selectBuildStar(page: Page, id: string): Promise<void> {
    await page.getByTestId('debug-search').fill(id)
    await page.locator(`[data-star-id="${id}"]`).click()
}
export function buildMetric(page: Page, label: string): Locator {
    return page.locator(`[data-build-metric="${label}"] dd`)
}
export function buildResultPanel(page: Page): Locator {
    return page.locator(
        '[data-testid="debug-prayer-calculator"], [data-testid="debug-build-summary"]'
    )
}
export async function setBuildPanelsOpen(page: Page, open: boolean): Promise<void> {
    for (const panel of [page.getByTestId('debug-mastery-summary'), buildResultPanel(page)]) {
        const currentOpen = (await panel.getAttribute('open')) !== null
        if (currentOpen === open) continue
        await panel.locator(':scope > summary').click()
    }
}
async function focusBuildStar(page: Page, id: string): Promise<Locator> {
    await selectBuildStar(page, id)
    const graph = page.getByRole('group', { name: 'Созвездия развития' })
    await graph.scrollIntoViewIfNeeded()
    const star = graph.locator(`[data-node-id="${id}"]`)
    await star.locator('.hit').click()
    await expect(star).toBeFocused()
    return star
}
async function spaceStar(page: Page, id: string): Promise<void> {
    const star = await focusBuildStar(page, id)
    await star.press('Space')
}
async function expectFloatingFeedback(page: Page): Promise<Locator> {
    const feedback = page.getByTestId('debug-build-feedback')
    await expect(feedback).toHaveCount(1)
    await expect(feedback).toHaveCSS('position', 'fixed')
    await expect(feedback).toBeInViewport()
    const box = await feedback.boundingBox()
    const viewport = page.viewportSize()!
    expect(box).not.toBeNull()
    expect(viewport.width - box!.x - box!.width).toBeLessThanOrEqual(32)
    expect(viewport.height - box!.y - box!.height).toBeLessThanOrEqual(32)
    expect(
        await feedback.evaluate((element) => element.closest('.debug-selected-details'))
    ).toBeNull()
    await expect(
        feedback.getByRole('button', { name: 'Скрыть список отключённых звёзд' })
    ).toHaveCount(0)
    return feedback
}
async function panelPosition(page: Page): Promise<{ page: number; panel: number; card: number }> {
    return page.locator('.debug-selected-details').evaluate((panel) => ({
        page: window.scrollY,
        panel: panel.scrollTop,
        card: panel.querySelector('[data-testid="selected-star-card"]')!.getBoundingClientRect()
            .top,
    }))
}
async function count(page: Page, value: number): Promise<void> {
    await expect(page.getByTestId('debug-build-count').locator('strong')).toHaveText(String(value))
}
async function assertFeedbackWorkflow(page: Page): Promise<void> {
    const enabledKara = await focusBuildStar(page, 'prayer.harm')
    await page.locator('.debug-selected-details').evaluate((panel) => {
        panel.scrollTop = Math.min(80, panel.scrollHeight - panel.clientHeight)
    })
    const beforeFeedback = await panelPosition(page)
    await enabledKara.press('Space')
    await count(page, 2)
    await expect(page.getByTestId('debug-build-cascade')).toContainText('Отключено звёзд: 3')
    await expect(page.getByTestId('debug-build-cascade')).toContainText('Гнев небес')
    const floatingFeedback = await expectFloatingFeedback(page)
    await expect(floatingFeedback.getByRole('button')).toHaveCount(0)
    expect(await panelPosition(page)).toEqual(beforeFeedback)
    await spaceStar(page, 'prayer.revive')
    await count(page, 1)
    await expectFloatingFeedback(page)
    await expect(page.getByTestId('debug-build-cascade')).toContainText('Воскрешение')
    await expect(page.getByTestId('debug-build-cascade')).not.toContainText('Гнев небес')
    await page.mouse.move(0, 0)
    await expect(floatingFeedback).toHaveCount(0, { timeout: 6_500 })
}
async function assertPrayerMood(page: Page): Promise<void> {
    const benevolent = page
        .getByTestId('debug-prayer-mood')
        .getByRole('button', { name: 'Благосклонность' })
    await benevolent.click()
    await expect(benevolent).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-metric="Шанс лечения"] dd')).toHaveText('80%')
    await expect(page.locator('[data-metric="Шанс кары"] dd')).toHaveText('95%')
    await page.getByTestId('debug-prayer-mood').getByRole('button', { name: 'Нейтральное' }).click()
}
async function expectPrayerRequirement(
    page: Page,
    current: number,
    required: number
): Promise<void> {
    const row = page.locator('[data-required-path="prayer"]')
    await expect(row).toHaveAttribute('data-required', String(required))
    await expect(row).toHaveAttribute('data-current', String(current))
    await expect(page.getByTestId('debug-star-level-status')).toContainText(
        current < required ? 'Недостаточно уровня' : 'Требование к уровню выполнено.'
    )
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
    expect(await page.getByTestId('debug-mastery-summary').getAttribute('open')).toBeNull()
    expect(await buildResultPanel(page).getAttribute('open')).toBeNull()
    await setBuildPanelsOpen(page, true)
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
    await expect(buildMetric(page, 'Радиус')).toHaveText('3 клетки')
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
    await expectFloatingFeedback(page)
    await count(page, 3)
    await page.screenshot({ path: info.outputPath(`mastery-blocked-${width}.png`), fullPage: true })
    await page.locator('[data-find-parent="prayer.harm1"]').click()
    await count(page, 3)
    await expectPrayerRequirement(page, 1, 6)
    await page.getByTestId('selected-star-toggle').click()
    await count(page, 4)
    await expectPrayerRequirement(page, 6, 6)
    await expect(page.getByTestId('debug-mastery-level')).toHaveText('6')
    await spaceStar(page, 'prayer.harm2')
    await count(page, 5)
    await expect(page.getByTestId('debug-mastery-level')).toHaveText('12')
    await expect(page.getByTestId('debug-mastery-total')).toHaveText('19\u00a0067,49 XP')
    await expect(page.getByTestId('debug-mastery-pending')).toContainText('9')
    await expect(page.getByTestId('debug-mastery-next')).toHaveText(
        '131 действий · 0 / 4\u00a0687,22 XP'
    )
    await selectBuildStar(page, 'prayer.root')
    await expect(buildMetric(page, 'Множитель кары')).toHaveText('×5,6')
    await expect(buildMetric(page, 'Урон кары')).toContainText('34 HP')
    await assertPrayerMood(page)
    await page.screenshot({ path: info.outputPath(`mastery-build-${width}.png`), fullPage: true })
    await assertFeedbackWorkflow(page)
    await selectBuildStar(page, 'prayer.root')
    await expect(page.locator('[data-metric="Шанс кары"]')).toHaveCount(0)
    expect(
        await graph
            .locator('[data-node-id]')
            .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')))
    ).toEqual(initialCoordinates)
    await page.getByTestId('debug-build-reset').click()
    await page.getByTestId('debug-search').fill('')
}
