import { expect, test } from '@playwright/test'

import { expectUiFits, readyUiStory, uiStoryUrl } from './ui-story-ready'

for (const width of [1280, 320]) {
    test(`WorkshopOrders ready for collection at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 640 })
        await page.goto(uiStoryUrl('entities-shops-workshoporders--ready-for-collection'))
        const workshop = page.getByRole('region', { name: 'Заказы ремесленнику' })
        await expect(workshop.getByText('Готов к получению')).toBeVisible()
        await expect(workshop.getByRole('button', { name: /^Получить/ })).toBeEnabled()
        await expect(workshop.locator('.ui-item-slot img')).toHaveJSProperty('naturalWidth', 16)
        await readyUiStory(page)
        await expectUiFits(workshop, width)
        await expect(workshop).toHaveScreenshot(`workshop-orders-ready-${width}.png`)
    })
}

test('WorkshopOrders explains the deposit before placing an order', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto(uiStoryUrl('entities-shops-workshoporders--default'))
    const workshop = page.getByRole('region', { name: 'Заказы ремесленнику' })
    const order = workshop.getByRole('button', { name: /^Заказать/ })
    await order.click()
    const confirmation = workshop.getByRole('group', { name: 'Подтверждение заказа' })
    await expect(confirmation.getByText(/сейчас 13.*при получении 12/)).toBeVisible()
    await expect(confirmation.getByText(/Аванс не возвращается/)).toBeVisible()
    await readyUiStory(page)
    await expectUiFits(workshop, 320)
    await confirmation.getByRole('button', { name: 'Назад', exact: true }).click()
    await expect(order).toBeVisible()
})
