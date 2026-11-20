import { expect, type Page, test } from '@playwright/test'

async function selectVisibleAlly(page: Page, name: string): Promise<void> {
    const limit = await page.evaluate(() => {
        return Math.min(256, window.__ratataTest!.observe().targets.length + 1)
    })
    const panel = page.getByLabel('Выбранная цель')
    for (let count = 0; count < limit; count += 1) {
        await page.keyboard.press('KeyE')
        await expect(panel).toBeVisible()
        if (await panel.getByText(name, { exact: true }).isVisible()) break
    }
    await expect(panel.getByText(name, { exact: true })).toBeVisible()
}

async function talkThroughKeyboardMenu(page: Page, name: string): Promise<void> {
    await page.keyboard.press('KeyF')
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    const talk = menu.getByRole('menuitem', { name: `Поговорить: ${name}`, exact: true })
    await expect(talk).toBeEnabled()
    const limit = await menu.getByRole('menuitem').count()
    await page.keyboard.press('Home')
    for (let count = 0; count < limit; count += 1) {
        if (await talk.evaluate((element) => element === document.activeElement)) break
        await page.keyboard.press('ArrowDown')
    }
    await expect(talk).toBeFocused()
    await page.keyboard.press('Enter')
}

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
        // The generated guard post can be inside the guild. Enter by its real doorway first.
        const guildKey = await page.evaluate(
            () =>
                window
                    .__ratataTest!.observe()
                    .targets.find(
                        (target) =>
                            target.kind === 'building' && target.name === 'Гильдия искателей'
                    )!.key
        )
        const entered = await page.evaluate(
            (targetKey) => window.__ratataTest!.navigate({ targetKey }),
            guildKey
        )
        expect(entered.status, entered.reason).toBe('arrived')
        await expect
            .poll(() =>
                page.evaluate(() =>
                    window
                        .__ratataTest!.observe()
                        .targets.some((target) => target.id === 'npc_guard_1')
                )
            )
            .toBe(true)
        const approached = await page.evaluate(() => {
            const api = window.__ratataTest!
            const guard = api.observe().targets.find((target) => target.id === 'npc_guard_1')!
            return api.navigate({ targetKey: guard.key }, { tolerance: 32 })
        })
        expect(approached.status, approached.reason).toBe('arrived')
        const guardName = await page.evaluate(
            () =>
                window
                    .__ratataTest!.getState()
                    .snapshot!.characters.find((actor) => actor.id === 'npc_guard_1')!.nickname
        )
        await selectVisibleAlly(page, guardName)
        await talkThroughKeyboardMenu(page, guardName)
        const dialogue = page.getByRole('dialog', { name: /Разговор:.*Рада/ })
        await expect(dialogue).toBeVisible()
        const speechBadge = dialogue.locator('.soul-badge__speech')
        await expect(speechBadge).toHaveText('Есть речь')
        await expect(speechBadge.locator('.soul-speech-icon')).toBeVisible()
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
        await expect(dialogue).toHaveCount(0)
        await expect(page.locator('.speech-bubble')).toHaveCount(0)
    })
}
