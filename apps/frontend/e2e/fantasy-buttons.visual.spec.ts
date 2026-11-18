import { expect, type Locator, type Page, test } from '@playwright/test'

async function ready(page: Page): Promise<void> {
    await page.evaluate(async () => {
        await document.fonts.ready
        await Promise.all(Array.from(document.images, (image) => image.decode()))
        const sources = new Set<string>()
        for (const element of document.querySelectorAll('.game-button--fantasy, .game-frame')) {
            for (const pseudo of ['::before', '::after']) {
                const source = getComputedStyle(element, pseudo).borderImageSource
                const url = source.match(/url\(["']?(.*?)["']?\)/)?.[1]
                if (url) sources.add(url)
            }
        }
        await Promise.all(
            Array.from(sources, async (src) => {
                const image = new Image()
                image.src = src
                await image.decode()
            })
        )
    })
}

async function assertFits(stage: Locator, width: number): Promise<void> {
    const bounds = await stage.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    // The parchment decoration outsets across the host's transparent border.
    // Check its border box and the real controls, not the smaller client box.
    expect(
        await stage.evaluate(
            (element) => element.scrollWidth <= Math.ceil(element.getBoundingClientRect().width)
        )
    ).toBe(true)
    expect(
        await stage.page().evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    ).toBe(true)
    for (const button of await stage.getByRole('button').all()) {
        expect(await button.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
            true
        )
        const buttonBounds = await button.boundingBox()
        expect(buttonBounds!.x).toBeGreaterThanOrEqual(bounds!.x)
        expect(buttonBounds!.x + buttonBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width)
    }
}

for (const width of [1280, 390, 320]) {
    test(`fantasy menu actions and keyboard order at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto('/iframe.html?id=interface-fantasy-buttons--menu&viewMode=story')
        const menu = page.getByRole('dialog', { name: 'Игровое меню', exact: true })
        await expect(menu).toBeVisible()
        await expect(menu.getByRole('button')).toHaveCount(6)
        await ready(page)
        await assertFits(menu, width)
        await expect(menu).toHaveScreenshot(`fantasy-menu-${width}.png`, { threshold: 0 })
        const resume = page.getByTestId('fantasy-menu-resume')
        await resume.focus()
        await expect(resume).toBeFocused()
        for (const action of ['character', 'markers', 'scenarios', 'sound', 'leave']) {
            const button = page.getByTestId(`fantasy-menu-${action}`)
            await expect(button).toBeEnabled()
            await page.keyboard.press('Tab')
            await expect(button).toBeFocused()
        }

        await expect(page.getByTestId('fantasy-menu-sound')).toHaveAttribute(
            'aria-pressed',
            'false'
        )
        await resume.focus()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('status', { name: 'Результат действия' })).toHaveText(
            'Действие: Вернуться в игру · 1'
        )
        await page.getByTestId('fantasy-menu-sound').click()
        await expect(page.getByTestId('fantasy-menu-sound')).toHaveAttribute('aria-pressed', 'true')
        await expect(page.getByTestId('fantasy-menu-sound')).toHaveText('Звук: выключен')
    })
}

for (const width of [1280, 320]) {
    for (const section of ['variants', 'sizes']) {
        test(`fantasy button ${section} at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto(`/iframe.html?id=interface-fantasy-buttons--${section}&viewMode=story`)
            const stage = page.locator('.fantasy-buttons-stage')
            await expect(stage).toBeVisible()
            await ready(page)
            await assertFits(stage, width)
            await expect(stage).toHaveScreenshot(`fantasy-${section}-${width}.png`, {
                threshold: 0,
            })
        })
    }
}

test('fantasy button visible states at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/iframe.html?id=interface-fantasy-buttons--states&viewMode=story')
    const stage = page.locator('.fantasy-buttons-stage')
    await expect(stage).toBeVisible()
    await expect(page.getByTestId('fantasy-disabled')).toBeDisabled()
    await expect(page.getByTestId('fantasy-selected')).toHaveAttribute('aria-pressed', 'true')
    await ready(page)
    await assertFits(stage, 390)
    await expect(stage).toHaveScreenshot('fantasy-states-390.png', { threshold: 0 })
})

test('fantasy buttons retain native focus hover and pressed behavior', async ({ page }) => {
    await page.goto('/iframe.html?id=interface-fantasy-buttons--states&viewMode=story')
    const focus = page.getByTestId('fantasy-focus')
    const hover = page.getByTestId('fantasy-hover')
    await focus.focus()
    await page.keyboard.press('Tab')
    await expect(hover).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(focus).toBeFocused()
    await ready(page)
    await expect(focus).toHaveScreenshot('fantasy-button-focus.png', { threshold: 0 })
    await hover.hover()
    await expect(hover).toHaveScreenshot('fantasy-button-hover.png', { threshold: 0 })
    const hoverBackground = await hover.evaluate(
        (element) => getComputedStyle(element).backgroundImage
    )
    await page.mouse.down()
    await expect(hover).not.toHaveCSS('background-image', hoverBackground)
    await expect(hover).toHaveScreenshot('fantasy-button-pressed.png', { threshold: 0 })
    await page.mouse.up()
})
