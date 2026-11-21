import { expect, type Locator, test } from '@playwright/test'

import { expectUiFits, readyUiStory, uiStoryUrl } from './ui-story-ready'

const storyId = 'entities-menu-menupanel'

async function expectHighlighted(panel: Locator, ids: string[]): Promise<void> {
    const selected = await panel
        .locator('[data-menu-highlighted="true"]')
        .evaluateAll((buttons) =>
            buttons.map((button) => button.getAttribute('data-dialog-action'))
        )
    expect(selected).toEqual(ids)
}

for (const width of [1280, 390, 320]) {
    for (const section of ['default', 'actions', 'disabled', 'long-labels', 'overflow']) {
        test(`MenuPanel ${section} at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 1000 })
            await page.goto(uiStoryUrl(`${storyId}--${section}`))
            const panel = page.locator('.menu-panel')
            await expect(panel).toBeVisible()
            await readyUiStory(page, true)
            await expectUiFits(panel, width)
            expect((await panel.boundingBox())!.width).toBe(Math.min(380, width - 32))
            await expect(panel).toHaveScreenshot(`menu-panel-${section}-${width}.png`)
        })
    }
}

test('MenuPanel uses the approved double frame, coffee palette and external item data', async ({
    page,
}) => {
    await page.goto(uiStoryUrl(`${storyId}--actions`))
    const panel = page.locator('.menu-panel')
    await expect(panel).toBeVisible()
    await readyUiStory(page)
    const outer = panel.locator('[data-fantasy-border="border-015"]')
    await expect(outer).toHaveCount(1)
    const inner = panel.locator('[data-fantasy-border="border-014"]')
    await expect(inner).toHaveCount(1)
    const gap = await inner.evaluate((element) => {
        const outer = element.closest('.menu-panel__outer')!
        const box = outer.getBoundingClientRect()
        const inside = element.getBoundingClientRect()
        const style = getComputedStyle(outer)
        return {
            x: inside.x - box.x - parseFloat(style.borderLeftWidth),
            y: inside.y - box.y - parseFloat(style.borderTopWidth),
        }
    })
    expect(gap).toEqual({ x: 10, y: 10 })
    await expect(outer).toHaveCSS('background-color', 'rgb(243, 228, 199)')
    await expect(panel.getByRole('heading', { name: 'Игровое меню' })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Персонаж · P', exact: true })).toBeVisible()
    await expect(panel.locator('[data-dialog-action]')).toHaveCount(6)
    await expect(panel.locator('[data-dialog-action="markers"]')).toHaveText('Метки')
    await expect(panel.locator('[data-dialog-action="leave"]')).toHaveText('Выйти из игры')
})

test('MenuPanel separates Exit with the requested two-ended native divider', async ({ page }) => {
    await page.goto(uiStoryUrl(`${storyId}--default`))
    const panel = page.locator('.menu-panel')
    await expect(panel).toBeVisible()
    await readyUiStory(page)
    const divider = panel.locator('.menu-panel__divider')
    await expect(divider).toHaveCount(1)
    await expect(divider).toHaveAttribute('data-fantasy-divider', 'divider-000')
    await expect(divider).toHaveAttribute('data-fantasy-divider-ends', 'both')
    await expect(divider).toHaveAttribute('data-fantasy-divider-fade', 'false')
    await expect(divider).toHaveCSS('height', '22px')
    await expect(divider).toHaveCSS('opacity', '0.6')
    const sound = await panel.locator('[data-dialog-action="sound"]').boundingBox()
    const separator = await divider.boundingBox()
    const leave = await panel.locator('[data-dialog-action="leave"]').boundingBox()
    expect(separator!.y).toBeGreaterThan(sound!.y + sound!.height)
    expect(leave!.y).toBeGreaterThan(separator!.y + separator!.height)
    expect(separator!.width / leave!.width).toBeCloseTo(0.7, 2)
    expect(separator!.x + separator!.width / 2).toBeCloseTo(leave!.x + leave!.width / 2, 1)
    await expect(panel.locator('[data-dialog-action]')).toHaveCount(6)
})

test('MenuPanel descriptions and hints stay readable on the approved coffee surface', async ({
    page,
}) => {
    await page.goto(uiStoryUrl(`${storyId}--disabled`))
    const panel = page.locator('.menu-panel')
    await expect(panel).toBeVisible()
    await readyUiStory(page)
    const paragraphs = panel.locator('.menu-panel__header p, .menu-panel__hint')
    await expect(paragraphs).toHaveCount(2)
    const ratios = await paragraphs.evaluateAll((elements) => {
        function luminance(color: string): number {
            const rgb = color
                .match(/[\d.]+/g)!
                .slice(0, 3)
                .map(Number)
            const linear = rgb.map((channel) => {
                const value = channel / 255
                return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
            })
            return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722
        }
        return elements.map((element) => {
            const foreground = luminance(getComputedStyle(element).color)
            const background = luminance(
                getComputedStyle(element.closest('.menu-panel__outer')!).backgroundColor
            )
            return (
                (Math.max(foreground, background) + 0.05) /
                (Math.min(foreground, background) + 0.05)
            )
        })
    })
    for (const ratio of ratios) {
        expect(ratio).toBeGreaterThanOrEqual(4.5)
    }
})

test('MenuPanel retains the last hovered action through every gap and clears on exit', async ({
    page,
}) => {
    await page.goto(uiStoryUrl(`${storyId}--default`))
    const panel = page.locator('.menu-panel')
    await expect(panel).toBeVisible()
    await readyUiStory(page)
    const ids = ['resume', 'character', 'markers', 'scenarios', 'sound', 'leave']
    for (let index = 0; index < ids.length - 1; index += 1) {
        const id = ids[index]!
        const button = panel.locator(`[data-dialog-action="${id}"]`)
        const next = panel.locator(`[data-dialog-action="${ids[index + 1]}"]`)
        await button.hover()
        await expectHighlighted(panel, [id])
        const from = await button.boundingBox()
        const to = await next.boundingBox()
        expect(to!.y).toBeGreaterThan(from!.y + from!.height)
        await page.mouse.move(from!.x + from!.width / 2, (from!.y + from!.height + to!.y) / 2)
        await expectHighlighted(panel, [id])
    }
    await page.mouse.move(0, 0)
    await expectHighlighted(panel, [])
    for (const button of await panel.getByRole('button').all()) {
        await expect(button).toHaveCSS(
            'background-image',
            /^(none|linear-gradient\(rgba\(0, 0, 0, 0\), rgba\(0, 0, 0, 0\)\))$/
        )
    }
})

test('MenuPanel never resurrects a clicked action and transfers highlight to real keyboard focus', async ({
    page,
}) => {
    await page.goto(uiStoryUrl(`${storyId}--default`))
    const panel = page.locator('.menu-panel')
    await expect(panel).toBeVisible()
    await readyUiStory(page)
    const character = panel.locator('[data-dialog-action="character"]')
    const markers = panel.locator('[data-dialog-action="markers"]')
    const scenarios = panel.locator('[data-dialog-action="scenarios"]')
    await character.click()
    await markers.hover()
    await expectHighlighted(panel, ['markers'])
    await page.mouse.move(0, 0)
    await expectHighlighted(panel, [])
    await expect(character).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(markers).toBeFocused()
    await expectHighlighted(panel, ['markers'])
    await expect(markers).toHaveAttribute('data-focus-ring', 'false')
    await expect(markers).toHaveCSS('outline-style', 'none')
    await page.keyboard.press('Tab')
    await expect(scenarios).toBeFocused()
    await expectHighlighted(panel, ['scenarios'])
    await character.hover()
    await expectHighlighted(panel, ['character'])
    await page.keyboard.press('Shift+Tab')
    await expect(markers).toBeFocused()
    await expectHighlighted(panel, ['markers'])
})

test('MenuPanel disabled actions remain unavailable and do not acquire hover highlight', async ({
    page,
}) => {
    await page.goto(uiStoryUrl(`${storyId}--disabled`))
    const panel = page.locator('.menu-panel')
    const character = panel.locator('[data-dialog-action="character"]')
    const sound = panel.locator('[data-dialog-action="sound"]')
    await expect(character).toBeDisabled()
    await expect(sound).toBeDisabled()
    await readyUiStory(page)
    await character.hover()
    await expectHighlighted(panel, [])
    await panel.locator('[data-dialog-action="resume"]').focus()
    await page.keyboard.press('Tab')
    await expect(panel.locator('[data-dialog-action="markers"]')).toBeFocused()
})

test('MenuPanel keyboard adapter navigates entity actions and skips disabled entries', async ({
    page,
}) => {
    await page.goto(uiStoryUrl(`${storyId}--disabled`))
    const panel = page.locator('.menu-panel')
    await expect(panel).toBeVisible()
    await readyUiStory(page)
    await panel.locator('[data-dialog-action="resume"]').focus()
    for (const [key, id] of [
        ['KeyS', 'markers'],
        ['ArrowDown', 'scenarios'],
        ['KeyW', 'markers'],
        ['ArrowUp', 'resume'],
        ['ArrowUp', 'leave'],
        ['Tab', 'resume'],
        ['Shift+Tab', 'leave'],
        ['Home', 'resume'],
        ['End', 'leave'],
    ]) {
        await page.keyboard.press(key!)
        await expect(panel.locator(`[data-dialog-action="${id}"]`)).toBeFocused()
        await expectHighlighted(panel, [id!])
    }
    await page.evaluate(() => {
        const input = document.createElement('input')
        input.setAttribute('aria-label', 'Outside menu')
        document.body.append(input)
    })
    const outside = page.getByRole('textbox', { name: 'Outside menu' })
    await outside.focus()
    await page.keyboard.press('KeyS')
    await expect(outside).toHaveValue('s')
    await page.keyboard.press('ArrowDown')
    await expect(outside).toBeFocused()
    await expectHighlighted(panel, [])
})

test('MenuPanel keyboard activation logs one action while confirmation is held', async ({
    page,
}) => {
    await page.goto(`/?path=/story/${storyId}--actions`)
    const preview = page.frameLocator('#storybook-preview-iframe')
    const markers = preview.locator('[data-dialog-action="markers"]')
    await expect(markers).toBeVisible()
    await page.getByRole('tab', { name: /^Actions/ }).click()
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    await markers.focus()
    await page.keyboard.down('Enter')
    await page.keyboard.down('Enter')
    await page.keyboard.up('Enter')
    await expect(page.getByRole('tabpanel')).toContainText(/onAction:\s*\(1\)\s*\["markers"\]/)
    await expect(page.getByRole('tabpanel')).not.toContainText(/onAction:\s*\(2\)/)
})

test('MenuPanel entity navigation scrolls the last action into view', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 480 })
    await page.goto(uiStoryUrl(`${storyId}--overflow`))
    const panel = page.locator('.menu-panel')
    await expect(panel).toBeVisible()
    await readyUiStory(page)
    await panel.locator('[data-dialog-action="resume"]').focus()
    await page.keyboard.press('End')
    const last = panel.locator('[data-dialog-action="extra-11"]')
    await expect(last).toBeFocused()
    await expect(last).toBeInViewport()
    await expectHighlighted(panel, ['extra-11'])
    await expect(panel.locator('.menu-panel__scroll')).not.toHaveJSProperty('scrollTop', 0)
})

test('MenuPanel scrolls its content while both frames and the last action remain reachable', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 480 })
    await page.goto(uiStoryUrl(`${storyId}--overflow`))
    const panel = page.locator('.menu-panel')
    const scroll = panel.locator('.menu-panel__scroll')
    await expect(panel).toBeVisible()
    await readyUiStory(page)
    const dimensions = await scroll.evaluate((element) => ({
        content: element.scrollHeight,
        visible: element.clientHeight,
    }))
    expect(dimensions.content).toBeGreaterThan(dimensions.visible)
    const before = await panel.boundingBox()
    expect(before!.height).toBeLessThanOrEqual(320)
    expect(before!.y + before!.height).toBeLessThanOrEqual(480)
    const last = panel.locator('[data-dialog-action="extra-11"]')
    await last.scrollIntoViewIfNeeded()
    await expect(last).toBeInViewport()
    await expect(scroll).not.toHaveJSProperty('scrollTop', 0)
    expect(await panel.boundingBox()).toEqual(before)
    await expectUiFits(panel, 320)
    await expect(panel).toHaveScreenshot('menu-panel-overflow-scrolled-320.png')
})
