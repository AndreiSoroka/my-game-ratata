import { expect, test } from '@playwright/test'

import {
    buildMetric,
    buildResultPanel,
    selectBuildStar,
    setBuildPanelsOpen,
} from './atlas-build-workflow'

for (const width of [320, 390, 1280]) {
    test(`expanded prayer atlas exposes independent actions and passive effects at ${width}px`, async ({
        page,
    }, info) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/?debug=constellations&class=cleric&seed=expanded-prayer')
        await expect(page.getByTestId('constellation-debug')).toBeVisible()
        await expect(page.locator('[data-star-id]')).toHaveCount(96)
        await setBuildPanelsOpen(page, true)
        const positions = await page
            .locator('[data-node-id]')
            .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')))
        await page.getByTestId('debug-build-all').click()
        await selectBuildStar(page, 'prayer.root')
        await expect(buildMetric(page, 'Максимум целей')).toHaveText('20')
        await expect(page.locator('[data-metric="Шанс лечения"] dd')).toHaveText('55%')
        await selectBuildStar(page, 'prayer.area')
        await expect(page.getByTestId('selected-star-card')).toContainText('Активное заклинание')
        await expect(buildMetric(page, 'Максимум целей')).toHaveText('20')
        await page.getByTestId('debug-auras-suppressed').check()
        await expect(buildMetric(page, 'Состояние аур')).toHaveText('Подавлены')
        await page.getByTestId('debug-external-advantage').check()
        await expect(page.locator('[data-metric="Шанс лечения"] dd')).toHaveText('79,75%')
        await expect(page.locator('[data-metric="Шанс очищения могилы"] dd')).toHaveText(
            '36% за шаг'
        )
        await selectBuildStar(page, 'prayer.aura_domain')
        await expect(buildMetric(page, 'Аура')).toHaveText('Подавлена')
        await expect(buildMetric(page, 'Лечение всех живых')).toContainText('5 × 1 HP')
        await expect(
            buildResultPanel(page).locator('[data-build-metric="Множитель лечения"]')
        ).toHaveCount(0)
        await selectBuildStar(page, 'prayer.martyr')
        await expect(buildMetric(page, 'Базовое максимальное HP')).toHaveText('−30%')
        await expect(buildMetric(page, 'Базовая максимальная MP')).toHaveText('−15%')
        await selectBuildStar(page, 'prayer.targets2')
        await expect(buildMetric(page, 'Дополнительные цели обеих молитв')).toHaveText('+3')
        await expect(buildResultPanel(page).locator('[data-metric]')).toHaveCount(0)
        await selectBuildStar(page, 'prayer.martyr')
        const graphNode = page.locator('[data-node-id="prayer.martyr"]')
        await graphNode.focus()
        await graphNode.press('Space')
        await expect(page.getByTestId('selected-star-toggle')).toHaveAttribute(
            'aria-checked',
            'false'
        )
        await graphNode.press('Space')
        await expect(page.getByTestId('selected-star-toggle')).toHaveAttribute(
            'aria-checked',
            'true'
        )
        expect(
            await page
                .locator('[data-node-id]')
                .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')))
        ).toEqual(positions)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            width
        )
        await page.screenshot({
            path: info.outputPath(`expanded-prayer-${width}.png`),
            fullPage: true,
        })
    })
}
