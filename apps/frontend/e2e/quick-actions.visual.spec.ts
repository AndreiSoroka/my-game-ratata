import { ABILITY_DEFINITIONS, abilityIds } from '@my-game-ratata/contracts'
import { expect, test } from '@playwright/test'

import { expectUiFits, readyUiStory, uiStoryUrl } from './ui-story-ready'

const slotStory = 'entities-quick-actions-quickactionslot'
const barStory = 'entities-quick-actions-quickactionbar'
const actionSlots = 'button.hotbar-slot'

test('QuickActionSlot Default Controls drive a direct component preview', async ({ page }) => {
    await page.goto(`/?path=/story/${slotStory}--default`)
    const preview = page.frameLocator('#storybook-preview-iframe')
    const slot = preview.locator('#storybook-root > div > .quick-action-slot')
    const button = slot.locator(actionSlots)
    await expect(button).toHaveAccessibleName(/^2: Искра/)
    await expect(slot.getByRole('button', { name: 'Очистить слот 2' })).toBeVisible()
    await page.getByRole('tab', { name: /^Controls/ }).click()
    const number = page.locator('#control-number')
    await number.fill('4')
    await number.press('Tab')
    await expect(button).toHaveAccessibleName(/^4: Искра/)
    await page.locator('#control-blocked').press('Space')
    await expect(button).toHaveAttribute('aria-disabled', 'true')
})

for (const width of [1280, 320]) {
    test(`QuickActionSlot ability catalog at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1340 })
        await page.goto(uiStoryUrl(`${slotStory}--ability-catalog`))
        const catalog = page.getByTestId('quick-action-catalog')
        const slots = catalog.locator(actionSlots)
        const names = [
            'Удар ножом',
            ...abilityIds.map((id) => ABILITY_DEFINITIONS[id].name),
            'Яблоко',
            'Посадить дерево',
        ]
        await expect(slots).toHaveCount(names.length)
        for (const [index, name] of names.entries()) {
            const slot = slots.nth(index)
            await expect(slot).toHaveAccessibleName(
                `${(index % 4) + 1}: ${name}. Shift+${(index % 4) + 1} — назначить`
            )
        }
        await expect(catalog.locator('.hotbar-item')).toHaveCount(2)
        await readyUiStory(page)
        await expectUiFits(catalog, width)
        await expect(catalog).toHaveScreenshot(`quick-action-ability-catalog-${width}.png`)
    })

    test(`QuickActionSlot selected, cooldown and counts at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(uiStoryUrl(`${slotStory}--states`))
        const gallery = page.getByTestId('quick-action-states')
        await expect(gallery.locator(`${actionSlots}[aria-pressed="true"]`)).toHaveCount(2)
        await expect(gallery.getByLabel('Автоповтор')).toHaveCount(1)
        await expect(gallery.locator('.hotbar-cooldown')).toHaveText(/2[.,]4/)
        await expect(gallery.locator(`${actionSlots} small`)).toHaveText(['3', '0'])
        await expect(
            gallery.getByRole('button', { name: /^\d: Яблоко/ })
        ).toHaveAccessibleDescription('Яблоко · В наличии: 3')
        await readyUiStory(page)
        await expectUiFits(gallery, width)
        await expect(gallery).toHaveScreenshot(`quick-action-states-${width}.png`)
    })

    for (const state of ['default', 'in-combat', 'inventory', 'blocked', 'empty']) {
        test(`QuickActionBar ${state} at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto(uiStoryUrl(`${barStory}--${state}`))
            const bar = page.locator('#storybook-root > div > .quick-action-bar')
            await expect(bar).toHaveAccessibleName('Быстрые действия')
            await expect(bar.locator(actionSlots)).toHaveCount(4)
            await expect(bar).not.toContainText('Дважды: повтор')
            await readyUiStory(page)
            await expectUiFits(bar, width)
            await expect(bar).toHaveScreenshot(`quick-action-bar-${state}-${width}.png`)
        })
    }
}
