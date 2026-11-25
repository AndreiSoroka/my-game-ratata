import { type ElementHandle, expect, test } from '@playwright/test'

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

test('recovers a lost graphics context in the same game session and offers a manual retry', async ({
    page,
}) => {
    test.setTimeout(60_000)
    const errors: string[] = []
    let connections = 0
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname === '/ws') connections += 1
    })

    await page.goto('/?test=1')
    await page.getByLabel('Имя героя').fill('WebGL Recovery')
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    const canvas = page.locator('canvas[data-game-canvas="true"]')
    await expectWebGLFrame(canvas)
    const identity = () => page.evaluate(() => window.__ratataTest?.getState().player?.id)
    const originalId = await identity()
    expect(originalId).toBeTruthy()
    await canvas.focus()

    const original = await canvas.elementHandle()
    await loseContext(original)
    await expect.poll(() => original.evaluate((element) => element.isConnected)).toBe(false)
    await expectWebGLFrame(canvas)
    await expect(canvas).toBeFocused()
    expect(await identity()).toBe(originalId)
    expect(connections).toBe(1)

    await loseContext(await canvas.elementHandle())
    const failure = page.getByRole('alert').filter({ hasText: 'WebGL' })
    const retry = failure.getByRole('button', { name: 'Восстановить графику' })
    await expect(retry).toBeVisible()
    await expect(canvas).toHaveCount(0)
    await retry.click()
    await expect(failure).toHaveCount(0)
    await expectWebGLFrame(canvas)
    await expect(page.locator('#ex-webgl-graphics-context-lost')).toHaveCount(0)
    expect(await identity()).toBe(originalId)
    expect(connections).toBe(1)
    expect(errors).toEqual([])
})

async function loseContext(canvas: ElementHandle<HTMLElement | SVGElement>): Promise<void> {
    await canvas.evaluate((element) => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error('Expected a game canvas')
        const extension = element.getContext('webgl2')?.getExtension('WEBGL_lose_context')
        if (!extension) throw new Error('Native WebGL context loss is unavailable')
        extension.loseContext()
    })
}
