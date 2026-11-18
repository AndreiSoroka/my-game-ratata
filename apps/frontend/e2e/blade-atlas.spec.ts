import { expect, test } from '@playwright/test'

import { fullConstellationCatalog } from '../../backend/src/game/constellationNodes'
import { buildMetric, selectBuildStar, setBuildPanelsOpen } from './atlas-build-workflow'

for (const width of [390, 1280]) {
    test(`Blade atlas keeps mandatory links and previews earned details at ${width}px`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/?debug=constellations&class=vanguard&seed=blade-contract')
        const atlas = page.getByTestId('constellation-debug')
        await expect(atlas).toBeVisible()
        const blade = fullConstellationCatalog.filter((node) => node.constellationId === 'blade')
        expect(blade).toHaveLength(42)
        await expect(page.locator('[data-star-id]')).toHaveCount(fullConstellationCatalog.length)
        await expect(page.locator('.constellation-edge--cross-link').first()).toHaveAttribute(
            'stroke-dasharray',
            '8 4 2 4'
        )
        await selectBuildStar(page, 'blade.wide_swing')
        const card = page.getByTestId('selected-star-card')
        await expect(card.getByRole('heading')).toHaveText('Широкий размах')
        await expect(card.locator('li')).toHaveCount(5)
        await page.getByTestId('selected-star-toggle').click()
        await expect(page.locator('[data-find-parent]')).toHaveCount(2)
        await page.getByTestId('debug-character-knowledge').check()
        await expect(card.locator('li')).toHaveCount(0)
        await page.getByTestId('debug-build-all').click()
        await expect(card.locator('li')).toHaveCount(5)
        await setBuildPanelsOpen(page, true)
        await expect(buildMetric(page, 'Цена приёма, EN')).toHaveText('17')
        await expect(buildMetric(page, 'Момент попадания, мс')).toHaveText('250')
        await expect(buildMetric(page, 'Возвращение движения, мс')).toHaveText('350')
        await page.getByTestId('debug-search').fill('blade.insight')
        for (const [id, count] of [
            ['blade.insight3', 2],
            ['blade.insight2', 1],
            ['blade.insight1', 0],
        ] as const) {
            await page.locator(`[data-star-toggle="${id}"]`).click()
            await expect(card.locator('li')).toHaveCount(count)
        }
        await page.getByTestId('debug-character-knowledge').uncheck()
        await expect(card.locator('li')).toHaveCount(5)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            width
        )
    })
}
