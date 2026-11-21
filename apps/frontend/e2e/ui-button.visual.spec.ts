import { expect, type Locator, test } from '@playwright/test'

import { readScreenshotPixels, screenshotPixel } from './fantasy-border-pixels'
import { expectUiFits, readyUiStory, uiStoryUrl } from './ui-story-ready'

const storyId = 'shared-common-button'
const transparentBackground = /^(none|linear-gradient\(rgba\(0, 0, 0, 0\), rgba\(0, 0, 0, 0\)\))$/

const raisedPanelShadow = /drop-shadow\(.*0px 2px 2px/
const pressedPanelShadow = /drop-shadow\(.*0px 1px 1px/

function panelFilter(panel: Locator): Promise<string> {
    return panel.evaluate((element) => getComputedStyle(element, '::before').filter)
}

function panelGradientTop(panel: Locator): Locator {
    return panel.locator('feFlood[result="panel-top-color"]')
}

for (const width of [1280, 390, 320]) {
    for (const section of [
        'default',
        'appearances',
        'variants',
        'borders',
        'colors',
        'states',
        'panel-states',
    ]) {
        test(`UiButton ${section} at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 1000 })
            await page.goto(uiStoryUrl(`${storyId}--${section}`))
            const stage = page.getByTestId('ui-button-story')
            await expect(stage).toBeVisible()
            await readyUiStory(page)
            await expectUiFits(stage, width)
            await expect(stage).toHaveScreenshot(`ui-button-${section}-${width}.png`)
        })
    }
}

test('UiButton catalog composes all 32 independent native border variants', async ({ page }) => {
    await page.goto(uiStoryUrl(`${storyId}--borders`))
    const stage = page.getByTestId('ui-button-story')
    await expect(stage.getByRole('button')).toHaveCount(32)
    await readyUiStory(page)
    for (let index = 0; index < 32; index += 1) {
        const key = `border-${String(index).padStart(3, '0')}`
        const frame = stage.locator(`[data-fantasy-border="${key}"]`)
        await expect(frame).toHaveCount(1)
        expect(await frame.evaluate((element) => element.tagName)).toBe('SPAN')
        await expect(frame).toHaveAttribute('aria-hidden', 'true')
        const button = stage.getByRole('button').nth(index)
        expect(await button.evaluate((element) => element.tagName)).toBe('BUTTON')
        await expect(button).toHaveAttribute('type', 'button')
    }
})

test('UiButton keeps every label clear of the authored horizontal border rails', async ({
    page,
}) => {
    await page.goto(uiStoryUrl(`${storyId}--borders`))
    const stage = page.getByTestId('ui-button-story')
    await expect(stage.getByRole('button')).toHaveCount(32)
    await readyUiStory(page)
    const clearances = await stage.getByRole('button').evaluateAll(async (buttons) => {
        return Promise.all(
            buttons.map(async (button) => {
                const frame = button.querySelector('.fantasy-border')!
                const label = button.querySelector('.ui-button__content')!
                const source = getComputedStyle(frame, '::before')
                const match = source.borderImageSource.match(/url\(["']?(.*?)["']?\)/)
                const image = new Image()
                image.src = match![1]!
                await image.decode()
                const canvas = document.createElement('canvas')
                canvas.width = image.naturalWidth
                canvas.height = image.naturalHeight
                const context = canvas.getContext('2d')!
                context.drawImage(image, 0, 0)
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
                const slice = parseFloat(source.borderImageSlice)
                let top = 0
                let bottom = 0
                for (let y = 0; y < slice; y += 1) {
                    for (let x = slice; x < canvas.width - slice; x += 1) {
                        if (pixels[(y * canvas.width + x) * 4 + 3]! > 0) {
                            top = Math.max(top, y + 1)
                        }
                        const reverseY = canvas.height - y - 1
                        if (pixels[(reverseY * canvas.width + x) * 4 + 3]! > 0) {
                            bottom = Math.max(bottom, y + 1)
                        }
                    }
                }
                const borderBox = frame.getBoundingClientRect()
                const textBox = label.getBoundingClientRect()
                return {
                    border: (frame as HTMLElement).dataset.fantasyBorder,
                    top: textBox.top - borderBox.top - top,
                    bottom: borderBox.bottom - bottom - textBox.bottom,
                }
            })
        )
    })
    for (const clearance of clearances) {
        expect(clearance.top, `${clearance.border} top rail`).toBeGreaterThanOrEqual(0)
        expect(clearance.bottom, `${clearance.border} bottom rail`).toBeGreaterThanOrEqual(0)
    }
})

test('UiButton ghost stays transparent until pointer or keyboard highlights it', async ({
    page,
}) => {
    await page.goto(uiStoryUrl(`${storyId}--appearances`))
    const ghost = page.getByTestId('ui-button-ghost')
    const filled = page.getByTestId('ui-button-filled')
    await expect(ghost).toBeVisible()
    await readyUiStory(page)
    await expect(ghost).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(ghost).toHaveCSS('background-image', transparentBackground)
    await expect(filled).not.toHaveCSS('background-image', 'none')
    await ghost.hover()
    await expect(ghost).not.toHaveCSS('background-image', transparentBackground)
    await page.mouse.move(0, 0)
    await expect(ghost).toHaveCSS('background-image', transparentBackground)
    await ghost.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(ghost).toBeFocused()
    await expect(ghost).not.toHaveCSS('background-image', transparentBackground)
})

test('UiButton filled keeps its ornament and bottom shadow while removing the dark default edge', async ({
    page,
}) => {
    await page.goto(uiStoryUrl(`${storyId}--appearances`))
    const filled = page.getByTestId('ui-button-filled')
    await expect(filled.locator('[data-fantasy-border]')).toHaveAttribute(
        'data-fantasy-border',
        'border-026'
    )
    const bottomShadow = / 0px 2px 3px 0px(?:,|$)/
    const darkEdge = /rgb\(90, 59, 34\) 0px 0px 0px 1px inset/
    await expect(filled).toHaveCSS('box-shadow', bottomShadow)
    await expect(filled).not.toHaveCSS('box-shadow', darkEdge)
    await filled.hover()
    await expect(filled).toHaveCSS('box-shadow', bottomShadow)
    await expect(filled).not.toHaveCSS('box-shadow', darkEdge)
})

test('UiButton panel appearances preserve the native label and center alpha with a vertical gradient', async ({
    page,
}) => {
    await page.goto(uiStoryUrl(`${storyId}--appearances`))
    const stage = page.getByTestId('ui-button-story')
    await expect(stage).toBeVisible()
    await readyUiStory(page)
    for (const [appearance, alpha] of [
        ['solid', 255],
        ['transparent-center', 127],
    ] as const) {
        const button = page.getByTestId(`ui-button-panel-${appearance}`)
        const panel = button.locator('[data-fantasy-panel]')
        await expect(button).toHaveJSProperty('tagName', 'BUTTON')
        await expect(button).toHaveAccessibleName('Продолжить')
        await expect(panel).toHaveJSProperty('tagName', 'SPAN')
        await expect(panel).toHaveAttribute('data-fantasy-panel', 'panel-004')
        await expect(panel).toHaveAttribute('data-fantasy-panel-appearance', appearance)
        await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
        await expect(button).toHaveCSS('background-image', 'none')
        await expect(button).toHaveCSS('box-shadow', 'none')
        await expect.poll(() => panelFilter(panel)).toMatch(raisedPanelShadow)

        await stage.evaluate((element) => (element.style.backgroundColor = 'white'))
        const onWhite = await readScreenshotPixels(button)
        await stage.evaluate((element) => (element.style.backgroundColor = 'black'))
        const onBlack = await readScreenshotPixels(button)

        // Away from the text and frame, the same fill reveals exactly 255 minus its alpha.
        const x = Math.floor(onWhite.width / 4)
        const top = Math.floor(onWhite.height / 3)
        const bottom = Math.floor((onWhite.height * 2) / 3)
        for (const y of [top, bottom]) {
            const white = screenshotPixel(onWhite, x, y)
            const black = screenshotPixel(onBlack, x, y)
            for (let channel = 0; channel < 3; channel += 1) {
                const background = white[channel]! - black[channel]!
                expect(Math.abs(background - (255 - alpha))).toBeLessThanOrEqual(2)
            }
        }
        expect(screenshotPixel(onWhite, x, top)[0]!).toBeGreaterThan(
            screenshotPixel(onWhite, x, bottom)[0]!
        )
    }
})

test('UiButton wraps a long label within the center of a large FantasyPanel at 320px', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 1000 })
    await page.goto(uiStoryUrl(`${storyId}--panel-states`))
    const button = page.getByTestId('ui-button-panel-long')
    const panel = button.locator('[data-fantasy-panel="panel-025"]')
    await expect(panel).toBeVisible()
    await readyUiStory(page)
    const geometry = await panel.evaluate((element) => {
        const frame = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        const label = element.querySelector('.ui-button__content')!
        const range = document.createRange()
        range.selectNodeContents(label)
        const lines = [...range.getClientRects()]
        return {
            lineCount: lines.length,
            inside: lines.every(
                (line) =>
                    line.left >= frame.left + parseFloat(style.borderLeftWidth) &&
                    line.right <= frame.right - parseFloat(style.borderRightWidth) &&
                    line.top >= frame.top + parseFloat(style.borderTopWidth) &&
                    line.bottom <= frame.bottom - parseFloat(style.borderBottomWidth)
            ),
        }
    })
    expect(geometry.lineCount).toBeGreaterThan(1)
    expect(geometry.inside).toBe(true)

    const image = await readScreenshotPixels(button)
    // The panel-025 nine-slice boundary is 22px from the edge. Both points are inside its fill.
    for (const fraction of [0.25, 0.5, 0.75]) {
        const y = Math.floor(image.height * fraction)
        const railFill = screenshotPixel(image, 20, y)
        const centerFill = screenshotPixel(image, 24, y)
        for (let channel = 0; channel < 3; channel += 1) {
            expect(Math.abs(railFill[channel]! - centerFill[channel]!)).toBeLessThanOrEqual(2)
        }
    }
})

test('UiButton panel artwork follows hover, keyboard focus, press and disabled states', async ({
    page,
}) => {
    await page.goto(uiStoryUrl(`${storyId}--panel-states`))
    const stage = page.getByTestId('ui-button-story')
    const solid = page.getByTestId('ui-button-panel-action')
    const translucent = page.getByTestId('ui-button-panel-translucent-action')
    const disabled = page.getByTestId('ui-button-panel-disabled')
    await expect(solid).toBeVisible()
    await readyUiStory(page)

    const solidPanel = solid.locator('[data-fantasy-panel]')
    const solidTop = panelGradientTop(solidPanel)
    const rest = await solidTop.evaluate((element) => getComputedStyle(element).floodColor)
    await solid.hover()
    await expect(solidTop).not.toHaveCSS('flood-color', rest)
    const hover = await solidTop.evaluate((element) => getComputedStyle(element).floodColor)
    await expect.poll(() => panelFilter(solidPanel)).toMatch(raisedPanelShadow)
    await expect(solid).toHaveCSS('background-image', 'none')
    await expect(solid).toHaveCSS('box-shadow', 'none')
    await expect(solid).toHaveScreenshot('ui-button-panel-hover.png')
    await page.mouse.down()
    try {
        await expect(solidTop).not.toHaveCSS('flood-color', hover)
        await expect.poll(() => panelFilter(solidPanel)).toMatch(pressedPanelShadow)
        await expect(solid).toHaveCSS('background-image', 'none')
        await expect(solid).toHaveCSS('box-shadow', 'none')
        await expect(solid).toHaveScreenshot('ui-button-panel-pressed.png')
    } finally {
        await page.mouse.up()
    }

    await page.mouse.move(0, 0)
    await expect(solidTop).toHaveCSS('flood-color', rest)
    const translucentPanel = translucent.locator('[data-fantasy-panel]')
    const translucentTop = panelGradientTop(translucentPanel)
    const translucentRest = await translucentTop.evaluate(
        (element) => getComputedStyle(element).floodColor
    )
    await page.keyboard.press('Tab')
    await expect(translucent).toBeFocused()
    await expect(translucent).toHaveCSS('outline-style', 'solid')
    await expect(translucent).toHaveCSS('background-image', 'none')
    await expect(translucentTop).not.toHaveCSS('flood-color', translucentRest)
    await expect.poll(() => panelFilter(translucentPanel)).toMatch(raisedPanelShadow)
    await expect(stage).toHaveScreenshot('ui-button-panel-focus.png')

    const disabledPanel = disabled.locator('[data-fantasy-panel]')
    const disabledTop = panelGradientTop(disabledPanel)
    const disabledRest = await disabledTop.evaluate(
        (element) => getComputedStyle(element).floodColor
    )
    await expect(disabled).toBeDisabled()
    await disabled.hover()
    await expect(disabledTop).toHaveCSS('flood-color', disabledRest)
})

test('UiButton paints custom state colors and resolves CSS variables in its border only', async ({
    page,
}) => {
    await page.goto(uiStoryUrl(`${storyId}--colors`))
    const custom = page.getByTestId('ui-button-custom')
    await expect(custom).toBeVisible()
    await readyUiStory(page)
    await expect(custom).toHaveCSS('color', 'rgb(242, 245, 255)')
    await expect(custom).toHaveCSS(
        'background-image',
        'linear-gradient(rgb(50, 92, 131), rgb(36, 66, 96))'
    )
    await expect(custom.locator('feFlood')).toHaveCSS('flood-color', 'rgb(158, 205, 255)')
    await custom.hover()
    await expect(custom.locator('feFlood')).toHaveCSS('flood-color', 'rgb(196, 220, 255)')
    await expect(custom).toHaveCSS(
        'background-image',
        'linear-gradient(rgb(61, 111, 155), rgb(49, 92, 131))'
    )
})

test('UiButton controlled highlight stays independent of pointer, focus and toggle semantics', async ({
    page,
}) => {
    await page.goto(uiStoryUrl(`${storyId}--states`))
    const on = page.getByTestId('ui-button-controlled-on')
    const off = page.getByTestId('ui-button-controlled-off')
    const toggle = page.getByTestId('ui-button-toggle')
    await expect(on).toBeVisible()
    await readyUiStory(page)
    await expect(on).not.toHaveCSS('background-image', transparentBackground)
    await off.hover()
    await expect(off).toHaveCSS('background-image', transparentBackground)
    await off.focus()
    await expect(off).toBeFocused()
    await expect(off).toHaveCSS('background-image', transparentBackground)
    await page.mouse.move(0, 0)
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(toggle).toHaveCSS('background-image', transparentBackground)
})

test('UiButton custom ghost keeps its purple palette while pressed', async ({ page }) => {
    await page.goto(uiStoryUrl(`${storyId}--colors`))
    const button = page.getByTestId('ui-button-custom-ghost')
    await expect(button).toBeVisible()
    await readyUiStory(page)
    await expect(button).toHaveCSS('background-image', transparentBackground)
    await button.hover()
    const highlighted = 'linear-gradient(rgb(112, 80, 134), rgb(81, 53, 107))'
    await expect(button).toHaveCSS('background-image', highlighted)
    await page.mouse.down()
    try {
        await expect(button).toHaveCSS(
            'background-image',
            'linear-gradient(rgb(81, 53, 107), rgb(112, 80, 134))'
        )
        await expect(button.locator('feFlood')).toHaveCSS('flood-color', 'rgb(234, 217, 255)')
        await expect(button).toHaveCSS('color', 'rgb(255, 249, 232)')
        await expect(button).toHaveCSS('box-shadow', /inset/)
        await expect(button).toHaveScreenshot('ui-button-custom-ghost-pressed.png')
    } finally {
        await page.mouse.up()
    }
    await expect(button).toHaveCSS('background-image', highlighted)
})

test('UiButton Default Controls update the actual native button, border and panel', async ({
    page,
}) => {
    await page.goto(`/?path=/story/${storyId}--default`)
    const preview = page.frameLocator('#storybook-preview-iframe')
    const button = preview.getByTestId('ui-button-default')
    await expect(button).toBeVisible()
    await expect(button).toHaveAttribute('data-highlight-managed', 'false')
    const idle = await button.evaluate((element) => getComputedStyle(element).backgroundImage)
    await button.hover()
    await expect(button).not.toHaveCSS('background-image', idle)
    await page.mouse.move(0, 0)
    await page.getByRole('tab', { name: /^Controls/ }).click()
    await page.locator('#control-border').selectOption('border-020')
    await expect(button.locator('.fantasy-border')).toHaveAttribute(
        'data-fantasy-border',
        'border-020'
    )
    await page.locator('#control-appearance').selectOption('ghost')
    await expect(button).toHaveCSS('background-image', transparentBackground)
    await page.locator('#control-appearance').selectOption('panel')
    await page.locator('#control-panel').selectOption('panel-025')
    await page.locator('#control-panelAppearance').selectOption('transparent-center')
    const panel = button.locator('[data-fantasy-panel]')
    await expect(panel).toHaveAttribute('data-fantasy-panel', 'panel-025')
    await expect(panel).toHaveAttribute('data-fantasy-panel-appearance', 'transparent-center')
    await page.locator('#control-label').fill('Новое действие')
    await page.locator('#control-label').press('Tab')
    await expect(button).toHaveText('Новое действие')
    await expect(button).toHaveAttribute('data-focus-ring', 'true')
    await page.locator('label[for="control-focusRing"]').click()
    await expect(button).toHaveAttribute('data-focus-ring', 'false')
    await page.locator('label[for="control-disabled"]').click()
    await expect(button).toBeDisabled()
})

test('UiButton keeps real keyboard focus and highlight without a focus outline when requested', async ({
    page,
}) => {
    await page.goto(uiStoryUrl(`${storyId}--states`))
    const noRing = page.getByTestId('ui-button-focus-no-ring')
    await expect(noRing).toBeVisible()
    await readyUiStory(page)
    await expect(noRing).toHaveAttribute('data-focus-ring', 'false')
    await expect(noRing).toHaveCSS('background-image', transparentBackground)
    await page.getByTestId('ui-button-toggle').focus()
    await page.keyboard.press('Tab')
    await expect(noRing).toBeFocused()
    await expect(noRing).toHaveCSS('outline-style', 'none')
    await expect(noRing).not.toHaveCSS('background-image', transparentBackground)
})

test('Shared button and entity menu events use the built-in Storybook Actions panel', async ({
    page,
}) => {
    const cases = [
        {
            story: `${storyId}--default`,
            button: '[data-testid="ui-button-default"]',
            activate: (button: Locator) => button.click(),
            event: /onClick:\s*\(1\)/,
        },
        {
            story: `${storyId}--panel-states`,
            button: '[data-testid="ui-button-panel-action"]',
            activate: (button: Locator) => button.press('Space'),
            event: /onClick:\s*\(1\)/,
        },
        {
            story: 'entities-menu-menu--actions',
            button: '[data-dialog-action="markers"]',
            activate: (button: Locator) => button.click(),
            event: /onAction:\s*\(1\)\s*\["markers"\]/,
        },
    ]
    for (const example of cases) {
        await page.goto(`/?path=/story/${example.story}`)
        const preview = page.frameLocator('#storybook-preview-iframe')
        const button = preview.locator(example.button)
        await expect(button).toBeVisible()
        await page.getByRole('tab', { name: /^Actions/ }).click()
        await page.getByRole('button', { name: 'Clear', exact: true }).click()
        await example.activate(button)
        await expect(page.getByRole('tabpanel')).toContainText(example.event)
        await expect(preview.getByRole('status')).toHaveCount(0)
    }
})

test('UiButton native focus and pressed state keep the fantasy shadow and gradient feedback', async ({
    page,
}) => {
    await page.goto(uiStoryUrl(`${storyId}--states`))
    const focus = page.getByTestId('ui-button-focus')
    const hover = page.getByTestId('ui-button-hover')
    const disabled = page.getByTestId('ui-button-disabled')
    await expect(focus).toBeVisible()
    await readyUiStory(page)
    await expect(disabled).toBeDisabled()
    await focus.focus()
    await expect(focus).toBeFocused()
    await expect(focus).toHaveCSS('outline-style', 'solid')
    await expect(focus).toHaveScreenshot('ui-button-focus.png')
    await page.keyboard.press('Tab')
    await expect(hover).toBeFocused()
    await hover.hover()
    await expect(hover).toHaveScreenshot('ui-button-hover.png')
    const raised = await hover.evaluate((element) => ({
        background: getComputedStyle(element).backgroundImage,
        shadow: getComputedStyle(element).boxShadow,
    }))
    expect(raised.shadow).not.toBe('none')
    await page.mouse.down()
    await expect(hover).not.toHaveCSS('background-image', raised.background)
    await expect(hover).not.toHaveCSS('box-shadow', raised.shadow)
    await expect(hover).toHaveCSS('box-shadow', /inset/)
    await expect(hover).toHaveScreenshot('ui-button-pressed.png')
    await page.mouse.up()
    await expect(hover).toHaveCSS('box-shadow', raised.shadow)
})
