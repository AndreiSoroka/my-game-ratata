import { expect, type Page, test } from '@playwright/test'

for (const mobile of [false, true]) {
    test(`starts a fresh background after choosing final death (${mobile ? 'mobile' : 'desktop'})`, async ({
        page,
    }, info) => {
        test.setTimeout(120000)
        await page.setViewportSize(
            mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
        )
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        const name = `fallen-${info.project.name}-${mobile}`
        await page.evaluate((name) => window.__ratataTest!.join(name, 'cleric'), name)
        await expect(page.locator('canvas[data-game-canvas=true]')).toBeVisible()
        const old = await page.evaluate(() => window.__ratataTest!.getState().player!)
        await fallInWilderness(page)
        const dialog = page.getByRole('alertdialog', { name: 'Вы пали в бою' })
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText('уже нельзя будет воскресить')
        const button = dialog.getByRole('button', { name: 'Начать сначала', exact: true })
        const bounds = await button.boundingBox()
        expect(bounds?.x).toBeGreaterThanOrEqual(0)
        expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(mobile ? 390 : 1280)
        await page.keyboard.press('Tab')
        await expect(button).toBeFocused()
        await page.keyboard.press('Enter')
        await expect(page.getByLabel('Прошлое героя')).toBeVisible()
        await expect(page.getByLabel('Прошлое героя')).toBeFocused()
        await page.getByLabel('Прошлое героя').selectOption('ranger')
        await page.getByRole('button', { name: 'Enter', exact: true }).click()
        await expect
            .poll(() => page.evaluate(() => window.__ratataTest!.getState().player?.heroClass))
            .toBe('ranger')
        const fresh = await page.evaluate(() => window.__ratataTest!.getState())
        expect(fresh.player?.id).not.toBe(old.id)
        expect(fresh.player?.alive).toBe(true)
        expect(fresh.player?.inventory).toEqual([])
        expect(fresh.player?.equipment).toEqual({})
        expect(fresh.snapshot?.adventure?.gold).toBe(0)
        expect(fresh.snapshot?.adventure?.craftOrders).toEqual([])
        await expect(
            page.getByLabel('Быстрые действия').getByRole('button', { name: /^2:/ })
        ).toHaveAccessibleName(/2: Выстрел/)
        await expect(dialog).toHaveCount(0)
    })
}
async function fallInWilderness(page: Page): Promise<void> {
    const traveled = await page.evaluate(() =>
        window.__ratataTest!.travel('north', { timeoutMs: 30000 })
    )
    expect(traveled.status).toBe('arrived')
    await page.evaluate(async () => {
        const api = window.__ratataTest!,
            map = api.getState().location!.map
        // Walk into the authored encounter area through ordinary server navigation.
        await api.navigate(
            { x: map.worldWidth * 0.625, y: map.worldHeight * 0.45 },
            { timeoutMs: 20000 }
        )
        const state = api.getState()
        if (!state.player?.alive) return
        const enemy = state.snapshot?.characters.find(
            (character) => character.alive && character.relationship === 'hostile'
        )
        if (enemy) api.send({ type: 'move_to', target: enemy.position })
    })
    await expect
        .poll(() => page.evaluate(() => window.__ratataTest!.getState().player?.alive), {
            timeout: 20000,
        })
        .toBe(false)
    expect(
        await page.evaluate(() => window.__ratataTest!.getState().player?.life?.reviveMsLeft)
    ).toBeGreaterThan(0)
}
