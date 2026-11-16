import { expect, test } from '@playwright/test'

for (const mobile of [false, true]) {
    test(`prays without a target using the keyboard (${mobile ? 'mobile' : 'desktop'})`, async ({
        page,
    }, info) => {
        await page.setViewportSize(
            mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
        )
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate(
            async (name) => window.__ratataTest!.join(name, 'cleric'),
            `prayer-${info.project.name}-${mobile}`
        )
        await expect(page.locator('canvas[data-game-canvas=true]')).toBeVisible()
        await page.keyboard.press('KeyQ')
        await page.keyboard.press('Shift+Digit1')
        await expect(page.getByRole('dialog', { name: 'Назначить слот 1' })).toBeVisible()
        await page.keyboard.press('Enter')
        const slot = page.getByLabel('Быстрые действия').getByRole('button', { name: /^1:/ })
        await expect(slot).toHaveAccessibleName(/1: Молитва/)
        await expect(page.locator('.prayer-preview')).toHaveText('Помолиться · 0 MP · Без эффекта')

        const before = await page.evaluate(() => window.__ratataTest!.getState().player!)
        await page.keyboard.press('Digit1')
        await expect
            .poll(() =>
                page.evaluate(
                    () => window.__ratataTest!.getState().player?.abilities?.cooldowns.pray
                )
            )
            .toBeGreaterThan(0)
        await expect(slot.locator('.hotbar-cooldown')).toBeVisible()
        const after = await page.evaluate(() => window.__ratataTest!.getState().player!)
        expect(after.health).toEqual(before.health)
        expect(after.resources.mana.kind).toBe('percent')
        expect(after.resourceChecks?.prayers.pray.devotion).toBe('ready')
        expect(after.position).toEqual(before.position)
        expect(after.progression?.masteries).toEqual(before.progression?.masteries)
        await expect(
            page.getByText('Нет подходящей цели для молитвы.', { exact: true })
        ).toHaveCount(0)
    })
}
