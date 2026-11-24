import { expect, test } from '@playwright/test'

import { expectWebGLFrame, recordWebGLErrors } from './webgl-frame'

test('draws a live WebGL2 world through repeated joins and exits', async ({ page }) => {
    test.setTimeout(60_000)
    const errors = await recordWebGLErrors(page)
    await page.goto('/')
    const name = page.getByLabel('Имя героя')
    const join = page.getByRole('button', { name: 'Войти', exact: true })
    const canvas = page.locator('canvas[data-game-canvas="true"]')
    await name.fill('WebGL Traveller')

    for (let index = 0; index < 3; index++) {
        await join.click()
        await expect(page.getByRole('region', { name: 'Ресурсы игрока' })).toBeVisible()
        await expect(canvas).toBeVisible({ timeout: 15_000 })
        await expectWebGLFrame(canvas)
        await canvas.focus()
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: 'Выйти из игры', exact: true }).click()
        await expect(name).toBeVisible()
        await expect(canvas).toHaveCount(0)
    }

    expect(errors).toEqual([])
})
