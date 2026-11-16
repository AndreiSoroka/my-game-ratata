import { expect, type Page, test } from '@playwright/test'

import {
    buildMetric,
    buildResultPanel,
    selectBuildStar,
    setBuildPanelsOpen,
} from './atlas-build-workflow'

const chance = (page: Page, name: string) => page.locator(`[data-metric="${name}"] dd`)
async function enableStar(page: Page, id: string): Promise<void> {
    await selectBuildStar(page, id)
    await page.getByTestId('selected-star-toggle').click()
    await expect(page.getByTestId('selected-star-toggle')).toHaveAttribute('aria-checked', 'true')
}
async function inspectPrayer(page: Page, hp: string, success: string): Promise<void> {
    await selectBuildStar(page, 'prayer.root')
    await expect(chance(page, 'Шанс воскрешения')).toHaveText(success)
    await expect(buildMetric(page, 'HP после воскрешения')).toContainText(hp)
    await expect(buildMetric(page, 'MP и EN после воскрешения')).toContainText('1%')
    await expect(buildMetric(page, 'MP и EN после воскрешения')).toContainText(
        'минимум 1 каждого ресурса'
    )
}
async function requireLevel(page: Page, required: number, current: number): Promise<void> {
    const row = page.locator('[data-required-path="prayer"]')
    await expect(row).toHaveAttribute('data-required', String(required))
    await expect(row).toHaveAttribute('data-current', String(current))
}
async function addParents(page: Page): Promise<void> {
    await selectBuildStar(page, 'prayer.revive_angelic')
    await page.getByTestId('selected-star-toggle').click()
    await expect(page.getByTestId('debug-build-blocked')).toContainText('Опытное воскрешение')
    await expect(page.getByTestId('debug-build-blocked')).toContainText('Высшее воскрешение')
    await expect(page.getByTestId('debug-build-count').locator('strong')).toHaveText('2')
    await page.locator('[data-find-parent="prayer.revive_higher"]').click()
    await page.getByTestId('selected-star-toggle').click()
    await inspectPrayer(page, '75%', '55%')
    await selectBuildStar(page, 'prayer.revive_angelic')
    await page.getByTestId('selected-star-toggle').click()
    await expect(page.getByTestId('debug-build-blocked')).toContainText('Опытное воскрешение')
    await expect(page.locator('[data-find-parent="prayer.revive_higher"]')).toHaveCount(0)
    await page.locator('[data-find-parent="prayer.revive_experienced"]').click()
    await page.getByTestId('selected-star-toggle').click()
    await inspectPrayer(page, '75%', '65%')
}
async function assertOwnRevivalCards(page: Page): Promise<void> {
    await selectBuildStar(page, 'prayer.revive')
    await expect(chance(page, 'Шанс воскрешения')).toHaveText('80%')
    await expect(buildMetric(page, 'Ресурсы после воскрешения')).toContainText('1%')
    await expect(buildMetric(page, 'Ресурсы после воскрешения')).toContainText(
        'минимум 1 каждого ресурса'
    )
    await expect(buildResultPanel(page)).not.toContainText('150%')
    await selectBuildStar(page, 'prayer.revive_higher')
    await expect(buildMetric(page, 'HP после воскрешения')).toContainText('75%')
    await expect(buildResultPanel(page).locator('[data-metric]')).toHaveCount(0)
    for (const id of ['prayer.revive_experienced', 'prayer.revive_master']) {
        await selectBuildStar(page, id)
        await expect(buildMetric(page, 'Бонус шанса воскрешения')).toHaveText('+10 п.п.')
        await expect(buildResultPanel(page).locator('[data-metric]')).toHaveCount(0)
        await expect(buildResultPanel(page)).not.toContainText('+20')
    }
    await selectBuildStar(page, 'prayer.revive_stable')
    await expect(buildMetric(page, 'HP после воскрешения')).toContainText('100%')
    await expect(buildMetric(page, 'Бонус шанса воскрешения')).toHaveText('+5 п.п.')
    await expect(buildResultPanel(page)).not.toContainText('150%')
    await selectBuildStar(page, 'prayer.revive_angelic')
    await expect(chance(page, 'Ангельское при успешном воскрешении')).toHaveText('30%')
    await expect(buildMetric(page, 'Ресурсы при Ангельском воскрешении')).toContainText('150%')
    await expect(chance(page, 'Общий шанс Ангельского воскрешения')).toHaveCount(0)
    await expect(chance(page, 'Шанс воскрешения')).toHaveCount(0)
}
async function assertGraveUnchanged(page: Page): Promise<void> {
    await enableStar(page, 'prayer_grave.root')
    await enableStar(page, 'prayer_grave.revive')
    await selectBuildStar(page, 'prayer_grave.root')
    await expect(buildMetric(page, 'HP после воскрешения')).toContainText('50%')
    await expect(buildMetric(page, 'MP и EN после воскрешения')).toContainText('50%')
    await expect(chance(page, 'Шанс воскрешения')).toHaveText('55%')
    await expect(chance(page, 'Ангельское при успешном воскрешении')).toHaveCount(0)
}
for (const width of [320, 390, 1280]) {
    test(`resurrection branch shows own passives and complete Prayer results at ${width}px`, async ({
        page,
    }, info) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/?debug=constellations&class=cleric&seed=revival-branch')
        await expect(page.getByTestId('constellation-debug')).toBeVisible()
        await expect(page.locator('[data-star-id]')).toHaveCount(96)
        await setBuildPanelsOpen(page, true)
        const positions = await page
            .locator('[data-node-id]')
            .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')))
        await inspectPrayer(page, '1%', '55%')
        await addParents(page)
        await selectBuildStar(page, 'prayer.revive_master')
        await requireLevel(page, 12, 2)
        await expect(page.getByTestId('debug-star-level-status')).toContainText(
            'Недостаточно уровня'
        )
        await expect(buildMetric(page, 'Бонус шанса воскрешения')).toHaveText('+10 п.п.')
        await page.getByTestId('selected-star-toggle').click()
        await requireLevel(page, 12, 12)
        await inspectPrayer(page, '75%', '75%')
        await selectBuildStar(page, 'prayer.revive_stable')
        await requireLevel(page, 1, 12)
        await page.getByTestId('selected-star-toggle').click()
        await inspectPrayer(page, '100%', '80%')
        await enableStar(page, 'prayer.revive_angelic')
        await requireLevel(page, 12, 12)
        await inspectPrayer(page, '100%', '80%')
        await expect(chance(page, 'Ангельское при успешном воскрешении')).toHaveText('30%')
        await expect(chance(page, 'Общий шанс Ангельского воскрешения')).toHaveText('24%')
        await expect(buildMetric(page, 'Ресурсы при Ангельском воскрешении')).toContainText(
            '150% максимума HP, MP и EN'
        )
        await page
            .getByTestId('debug-prayer-mood')
            .getByRole('button', { name: 'Благосклонность' })
            .click()
        await expect(chance(page, 'Шанс воскрешения')).toHaveText('95%')
        await expect(chance(page, 'Шанс лечения')).toHaveText('80%')
        await expect(chance(page, 'Общий шанс Ангельского воскрешения')).toHaveText('28,5%')
        await assertOwnRevivalCards(page)
        await assertGraveUnchanged(page)
        expect(
            await page
                .locator('[data-node-id]')
                .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')))
        ).toEqual(positions)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            width
        )
        await selectBuildStar(page, 'prayer.root')
        await page.screenshot({
            path: info.outputPath(`resurrection-full-${width}.png`),
            fullPage: true,
        })
    })
}
