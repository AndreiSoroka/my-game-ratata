import { expect, test } from '@playwright/test'

for (const mobile of [false, true]) {
    test(`keeps a private complete dialogue in one keyboard-accessible bubble (${mobile ? 'mobile' : 'desktop'})`, async ({
        page,
    }, info) => {
        test.setTimeout(60_000)
        await page.setViewportSize(
            mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
        )
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate(async ({ name }) => window.__ratataTest!.join(name, 'cleric'), {
            name: `speech-${info.project.name}-${mobile}`,
        })
        await page.evaluate(() => {
            const guard = window
                .__ratataTest!.getState()
                .snapshot!.characters.find((actor) => actor.id === 'npc_guard_1')!
            window.__ratataTest!.send({
                type: 'move_to',
                target: { x: guard.position.x, y: guard.position.y + 24 },
            })
        })
        await expect
            .poll(() =>
                page.evaluate(() => {
                    const state = window.__ratataTest!.getState()
                    const guard = state.snapshot!.characters.find(
                        (actor) => actor.id === 'npc_guard_1'
                    )!
                    return Math.hypot(
                        state.player!.position.x - guard.position.x,
                        state.player!.position.y - guard.position.y
                    )
                })
            )
            .toBeLessThan(40)
        await page.keyboard.press('Shift+KeyT')
        await expect(page.getByLabel('Выбранная цель')).toContainText('Рада')
        await page.keyboard.press('KeyE')
        await expect(page.getByRole('menu')).toBeVisible()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('dialog', { name: /Разговор:.*Рада/ })).toBeVisible()
        const speech = await page.evaluate(
            () => window.__ratataTest!.getState().snapshot!.adventure!.dialogue!
        )
        await expect(page.locator('.speech-text')).toHaveText(speech.text)
        await expect(page.getByText(speech.text, { exact: true })).toHaveCount(1)
        const bounds = await page.locator('.speech-bubble').boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(12)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual((mobile ? 390 : 1280) - 12)
        await page.keyboard.press('PageDown')
        await expect(page.locator('.speech-text')).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog', { name: /Разговор:.*Рада/ })).toHaveCount(0)
        await expect(page.locator('.speech-bubble')).toHaveCount(0)
    })
}
