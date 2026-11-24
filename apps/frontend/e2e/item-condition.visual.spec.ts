import { expect, test } from '@playwright/test'

import { expectUiFits, readyUiStory, uiStoryUrl } from './ui-story-ready'

for (const [state, remaining] of [
    ['default', 97],
    ['broken', 0],
] as const) {
    test(`ItemCondition ${state} uses the inventory palette at 320px`, async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 460 })
        await page.goto(uiStoryUrl(`entities-items-itemcondition--${state}`))
        const condition = page.locator('.item-condition')
        await expect(condition.getByRole('meter')).toHaveAccessibleName(
            `Прочность ${remaining} из 200`
        )
        await readyUiStory(page)
        await expectUiFits(condition, 320)
        await expect(condition).toHaveScreenshot(`item-condition-${state}-320.png`)
    })
}
