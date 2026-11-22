import { expect, test } from '@playwright/test'

import { buildMetric, selectBuildStar, setBuildPanelsOpen } from './atlas-build-workflow'

for (const width of [390, 1280]) {
    test(`Arrow atlas shows starting aim and moving-shot upgrades at ${width}px`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/?debug=constellations&class=ranger&seed=archer-contract')
        await expect(page.getByTestId('constellation-debug')).toBeVisible({ timeout: 15_000 })
        const graph = page.getByRole('group', { name: 'Созвездия развития' })
        const star = (id: string) => graph.locator(`[data-node-id="arrow.${id}"]`)
        await expect(graph.locator('[data-node-id^="arrow."]')).toHaveCount(40)
        await expect(star('sniper_shot')).toHaveAttribute('data-enabled', 'true')
        await expect(star('moving_shot')).toHaveAttribute('data-enabled', 'false')

        await selectBuildStar(page, 'arrow.sniper_shot')
        await setBuildPanelsOpen(page, true)
        await expect(page.getByTestId('debug-mastery-level')).toHaveText('0')
        await expect(buildMetric(page, 'Прицеливание, мс')).toHaveText('700')
        await expect(buildMetric(page, 'Дальность Снайперского выстрела')).toHaveText('10 клеток')

        await page.getByTestId('debug-build-all').click()
        await expect(buildMetric(page, 'Прицеливание, мс')).toHaveText('550')
        await expect(buildMetric(page, 'Дальность Снайперского выстрела')).toHaveText('12 клеток')
        await selectBuildStar(page, 'arrow.root')
        await expect(buildMetric(page, 'Остановка при ходьбе, мс')).toHaveText('0')
        await expect(buildMetric(page, 'Урон при Смене позиции')).toHaveText('+20%')

        await page.getByTestId('debug-class').selectOption('vanguard')
        await page.getByTestId('debug-build-reset').click()
        await selectBuildStar(page, 'arrow.sniper_shot')
        await expect(star('sniper_shot')).toHaveAttribute('data-enabled', 'false')
        await expect(page.locator('[data-required-path="arrow"]')).toHaveAttribute(
            'data-required',
            '2'
        )
        await selectBuildStar(page, 'arrow.moving_shot')
        await expect(page.locator('[data-required-path="arrow"]')).toHaveAttribute(
            'data-required',
            '4'
        )
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            width
        )
    })
}
