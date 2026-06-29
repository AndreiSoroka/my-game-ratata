import { expect, test } from '@playwright/test'

test('requires a nickname before entering the game', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('h1')).toHaveText('Ratata')
    await expect(page.getByLabel('Nickname')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enter' })).toBeDisabled()
})
