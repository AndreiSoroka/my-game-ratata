import { expect, test } from '@playwright/test'

for (const mobile of [false, true]) {
    test(`HUD focus and game-menu ownership (${mobile ? 'mobile' : 'desktop'})`, async ({
        page,
    }, info) => {
        await page.setViewportSize(
            mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
        )
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate(
            (name) => window.__ratataTest!.join(name, 'arcanist'),
            `menu-${info.workerIndex}-${mobile}`
        )
        await page.addStyleTag({ content: '.test-panel { display: none !important }' })
        const guild = page.getByRole('button', { name: 'Гильдия', exact: true })
        await guild.click()
        await expect(page.getByRole('dialog', { name: 'Гильдия приключенцев' })).toBeVisible()
        await guild.click()
        await guild.focus()
        await page.keyboard.press('KeyI')
        await expect(page.getByRole('dialog', { name: 'Inventory and equipment' })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog', { name: 'Inventory and equipment' })).toHaveCount(0)
        const menu = page.getByRole('dialog', { name: 'Игровое меню' })
        await expect(menu).toHaveCount(0)
        const attack = page.getByRole('button', { name: /^1: Базовая атака/ })
        await attack.focus()
        await page.keyboard.press('KeyF')
        await expect(page.getByLabel('Выбранная цель')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByLabel('Выбранная цель')).toHaveCount(0)
        await expect(menu).toHaveCount(0)
        await page.keyboard.press('Shift+Digit3')
        await page
            .getByRole('dialog', { name: 'Назначить слот 3' })
            .getByRole('button', { name: /Искра/ })
            .click()
        await expect(page.getByRole('button', { name: /^3: Искра/ })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(menu).toBeVisible()
        const before = await page.evaluate(() => window.__ratataTest!.getState())
        await page.keyboard.press('KeyW')
        await page.keyboard.press('KeyI')
        await page.keyboard.press('Digit2')
        await expect
            .poll(() => page.evaluate(() => window.__ratataTest!.getState().snapshot?.tick))
            .toBeGreaterThan(before.snapshot!.tick + 2)
        const during = await page.evaluate(() => window.__ratataTest!.getState())
        expect(during.connected).toBe(true)
        expect(during.player?.position).toEqual(before.player?.position)
        expect(during.player?.resources).toEqual(before.player?.resources)
        await menu.getByRole('button', { name: 'Вернуться в игру' }).click()
        await expect(menu).toHaveCount(0)
        await page.evaluate(() => window.__ratataTest!.moveFor({ x: 1, y: 0 }, 250))
        const moved = await page.evaluate(() => window.__ratataTest!.getState().player!)
        expect(moved.position.x).toBeGreaterThan(before.player!.position.x)
        await page.getByRole('button', { name: 'Игровое меню', exact: true }).click()
        const stoppingTick = await page.evaluate(
            () => window.__ratataTest!.getState().snapshot!.tick
        )
        // moveFor sends stop; later server snapshots prove its position has actually settled.
        await expect
            .poll(() =>
                page.evaluate((tick) => {
                    const state = window.__ratataTest!.getState()
                    return {
                        advanced: (state.snapshot?.tick ?? 0) > tick + 2,
                        velocity: state.player?.velocity,
                        path: state.player?.path,
                    }
                }, stoppingTick)
            )
            .toEqual({ advanced: true, velocity: { x: 0, y: 0 }, path: [] })
        const saved = await page.evaluate(() => window.__ratataTest!.getState().player!)
        await menu.getByRole('button', { name: 'Выйти из игры' }).click()
        await expect(page.getByLabel('Nickname')).toBeVisible()
        expect(await page.evaluate(() => window.__ratataTest!.getState().connected)).toBe(false)
        await page.getByLabel('Nickname').fill(saved.nickname)
        await page.getByLabel('Прошлое героя', { exact: true }).selectOption('ranger')
        await page.getByRole('button', { name: 'Enter', exact: true }).click()
        await expect
            .poll(() => page.evaluate(() => window.__ratataTest!.getState().connected))
            .toBe(true)
        await expect(menu).toHaveCount(0)
        const restored = await page.evaluate(() => window.__ratataTest!.getState().player!)
        expect(restored.id).toBe(saved.id)
        expect(restored.inventory).toEqual(saved.inventory)
        expect(restored.equipment).toEqual(saved.equipment)
        expect(restored.position).toEqual(saved.position)
        expect(restored.heroClass).toBe('arcanist')
        await expect(page.getByRole('button', { name: /^2: Искра/ })).toBeVisible()
        await expect(page.getByRole('button', { name: /^3: Искра/ })).toBeVisible()
    })
}
