import { expect, type Page, test } from '@playwright/test'

for (const mobile of [false, true]) {
    test(`returns from chat reading and typing to movement (${mobile ? 'mobile' : 'desktop'})`, async ({
        page,
    }, info) => {
        await page.setViewportSize(
            mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
        )
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate(
            (name) => window.__ratataTest!.join(name),
            `chat-focus-${info.workerIndex}-${mobile}`
        )
        await expect
            .poll(() => page.evaluate(() => window.__ratataTest!.getState().connected))
            .toBe(true)
        await page.addStyleTag({ content: '.test-panel { display: none !important }' })
        const canvas = page.locator('canvas[data-game-canvas]')
        const history = page.getByRole('list', { name: 'Услышанные реплики' })
        await history.focus()
        await moveRight(page)
        await page.getByRole('button', { name: 'Рядом', exact: true }).focus()
        await moveRight(page)
        await history.focus()
        await page.keyboard.press('KeyQ')
        await page.keyboard.press('KeyF')
        await page.keyboard.press('Digit1')
        await expect(page.getByLabel('Выбранная цель')).toHaveCount(0)
        await page.evaluate(() =>
            window.__ratataTest!.send({
                type: 'chat',
                text: Array.from({ length: 20 }, (_, index) => `Строка ${index}`).join('\n'),
            })
        )
        await expect
            .poll(() => history.evaluate((element) => element.scrollHeight > element.clientHeight))
            .toBe(true)
        await history.focus()
        const scrollBefore = await history.evaluate((element) => element.scrollTop)
        const readingAt = await position(page)
        await page.keyboard.press('ArrowUp')
        await expect
            .poll(() => history.evaluate((element) => element.scrollTop))
            .toBeLessThan(scrollBefore)
        await settled(page)
        expect(await position(page)).toEqual(readingAt)

        await canvas.focus()
        await page.keyboard.press('Enter')
        await page.keyboard.type('first draft')
        const typingAt = await position(page)
        await page.keyboard.press('KeyW')
        await settled(page)
        expect(await position(page)).toEqual(typingAt)
        await expect(page.locator('.chat-input')).toContainText('first draftw')
        await page.keyboard.press('KeyQ')
        await page.keyboard.press('Digit1')
        await expect(page.getByLabel('Выбранная цель')).toHaveCount(0)
        await expect(page.locator('.chat-input')).toContainText('first draftwq1')
        await page.keyboard.down('Enter')
        await page.keyboard.down('Enter')
        await expect(page.locator('.chat-input')).toHaveCount(0)
        await page.keyboard.up('Enter')
        await expect(canvas).toBeFocused()
        await moveRight(page)

        await page.keyboard.press('Enter')
        await page.keyboard.type('keep draft')
        const beforeClick = await position(page)
        const bounds = await canvas.boundingBox()
        await canvas.click({ position: { x: bounds!.width * 0.85, y: bounds!.height * 0.4 } })
        await expect(page.locator('.chat-input')).toHaveCount(0)
        await expect(canvas).toBeFocused()
        await settled(page)
        expect(await position(page)).toEqual(beforeClick)
        await moveRight(page)
        await page.keyboard.press('Enter')
        await expect(page.locator('.chat-input__draft')).toHaveText('keep draft')
        await history.focus()
        await page.keyboard.press('Escape')
        await expect(page.locator('.chat-input')).toHaveCount(0)
        await expect(canvas).toBeFocused()
        await moveRight(page)
        await page.keyboard.press('Enter')
        await expect(page.locator('.chat-input__draft')).toHaveText('')
        await page.keyboard.press('Escape')

        await page.keyboard.press('KeyI')
        await expect(page.getByRole('dialog', { name: 'Inventory and equipment' })).toBeVisible()
        const modalAt = await position(page)
        await history.focus()
        await page.keyboard.press('KeyD')
        await settled(page)
        expect(await position(page)).toEqual(modalAt)
        await page.keyboard.press('Escape')
    })
}

async function position(page: Page) {
    return page.evaluate(() => window.__ratataTest!.getState().player!.position)
}

async function settled(page: Page): Promise<void> {
    const tick = await page.evaluate(() => window.__ratataTest!.getState().snapshot!.tick)
    await expect
        .poll(() =>
            page.evaluate((before) => {
                const state = window.__ratataTest!.getState()
                return (
                    (state.snapshot?.tick ?? 0) > before + 2 &&
                    state.player?.velocity.x === 0 &&
                    state.player.velocity.y === 0 &&
                    state.player.path.length === 0
                )
            }, tick)
        )
        .toBe(true)
}

async function moveRight(page: Page): Promise<void> {
    const before = await position(page)
    await page.keyboard.down('KeyD')
    try {
        await expect.poll(async () => (await position(page)).x).toBeGreaterThan(before.x)
    } finally {
        await page.keyboard.up('KeyD')
    }
    await settled(page)
}
