import { expect, test } from '@playwright/test'

import { expectUiFits, readyUiStory, uiStoryUrl } from './ui-story-ready'

const catalogs = [
    {
        name: 'bar-track',
        story: 'shared-common-bartrack',
        sections: ['default', 'colors', 'sizes'],
    },
    {
        name: 'game-bar',
        story: 'shared-common-gamebar',
        sections: ['default', 'resources', 'values', 'colors', 'sizes'],
    },
]

for (const width of [1280, 390, 320]) {
    for (const catalog of catalogs) {
        for (const section of catalog.sections) {
            test(`${catalog.name} ${section} at ${width}px`, async ({ page }) => {
                await page.setViewportSize({ width, height: 1000 })
                await page.goto(uiStoryUrl(`${catalog.story}--${section}`))
                const stage = page.getByTestId(`${catalog.name}-story`)
                await expect(stage).toBeVisible()
                await readyUiStory(page)
                await expectUiFits(stage, width)
                await expect(stage).toHaveScreenshot(`${catalog.name}-${section}-${width}.png`)
            })
        }
    }
}

test('GameBar shows exact empty, low and full fill with capped rounded ends', async ({ page }) => {
    await page.goto(uiStoryUrl('shared-common-gamebar--values'))
    const stage = page.getByTestId('game-bar-story')
    await expect(stage).toBeVisible()
    await readyUiStory(page)
    for (const value of [0, 1, 25, 50, 100]) {
        const bar = page.getByTestId(`game-bar-value-${value}`)
        await expect(bar).toHaveAttribute('role', 'progressbar')
        await expect(bar).toHaveAttribute('aria-valuemin', '0')
        await expect(bar).toHaveAttribute('aria-valuemax', '100')
        await expect(bar).toHaveAttribute('aria-valuenow', String(value))
        const geometry = await bar.evaluate((element) => {
            const fill = element.querySelector<HTMLElement>('.game-bar__fill')!
            const parent = fill.parentElement!
            const style = getComputedStyle(parent)
            return {
                fillWidth: fill.getBoundingClientRect().width,
                contentWidth:
                    parent.getBoundingClientRect().width -
                    parseFloat(style.borderLeftWidth) -
                    parseFloat(style.borderRightWidth) -
                    parseFloat(style.paddingLeft) -
                    parseFloat(style.paddingRight),
                fillRadius: parseFloat(getComputedStyle(fill).borderTopLeftRadius),
                fillHeight: fill.getBoundingClientRect().height,
            }
        })
        expect(geometry.fillWidth).toBeCloseTo((geometry.contentWidth * value) / 100, 1)
        expect(geometry.fillWidth).toBeLessThanOrEqual(geometry.contentWidth)
        expect(geometry.fillRadius).toBeGreaterThanOrEqual(geometry.fillHeight / 2)
    }
    const empty = page.getByTestId('game-bar-value-0').locator('.game-bar__fill')
    await expect(empty).toBeHidden()
    expect(await empty.evaluate((element) => element.getBoundingClientRect().width)).toBe(0)
})

test('resource presets have distinct fills and a recessed rounded track', async ({ page }) => {
    await page.goto(uiStoryUrl('shared-common-gamebar--resources'))
    await expect(page.getByTestId('game-bar-health')).toBeVisible()
    await readyUiStory(page)
    const fills = []
    for (const resource of ['health', 'mana', 'energy']) {
        const bar = page.getByTestId(`game-bar-${resource}`)
        const fill = bar.locator('.game-bar__fill')
        const appearance = await bar.evaluate((element) => {
            const fill = element.querySelector<HTMLElement>('.game-bar__fill')!
            const track = element.matches('.bar-track')
                ? element
                : element.querySelector('.bar-track')!
            const style = getComputedStyle(track)
            return {
                fill: getComputedStyle(fill).backgroundImage,
                radius: parseFloat(style.borderTopLeftRadius),
                height: track.getBoundingClientRect().height,
                shadow: style.boxShadow,
            }
        })
        fills.push(appearance.fill)
        expect(appearance.fill).not.toBe('none')
        expect(appearance.shadow).toContain('inset')
        expect(appearance.radius).toBeGreaterThanOrEqual(appearance.height / 2)
        await expect(fill).toBeVisible()
    }
    expect(new Set(fills).size).toBe(3)
})

test('GameBar Default Controls update fill geometry and independent CSS colors', async ({
    page,
}) => {
    await page.goto('/?path=/story/shared-common-gamebar--default')
    const preview = page.frameLocator('#storybook-preview-iframe')
    const bar = preview.getByTestId('game-bar-default')
    const track = bar.locator('.bar-track')
    const fill = bar.locator('.game-bar__fill')
    await expect(bar).toBeVisible()
    await page.getByRole('tab', { name: /^Controls/ }).click()
    await page.locator('#control-value').fill('80')
    await page.locator('#control-value').press('Tab')
    await page.locator('#control-max').fill('200')
    await page.locator('#control-max').press('Tab')
    await expect(bar).toHaveAttribute('aria-valuenow', '80')
    await expect(bar).toHaveAttribute('aria-valuemax', '200')
    const percent = await fill.evaluate(
        (element) => element.getBoundingClientRect().width / element.parentElement!.clientWidth
    )
    expect(percent).toBeCloseTo(0.4, 2)
    const oldFill = await fill.evaluate((element) => getComputedStyle(element).backgroundImage)
    const oldTrack = await track.evaluate((element) => getComputedStyle(element).backgroundColor)
    await page.locator('#control-color').fill('rgb(25, 145, 165)')
    await page.locator('#control-color').press('Tab')
    await expect(fill).not.toHaveCSS('background-image', oldFill)
    await expect(track).toHaveCSS('background-color', oldTrack)
    const customFill = await fill.evaluate((element) => getComputedStyle(element).backgroundImage)
    await page.locator('#control-trackColor').fill('hsl(270 25% 24%)')
    await page.locator('#control-trackColor').press('Tab')
    await expect(track).not.toHaveCSS('background-color', oldTrack)
    await expect(fill).toHaveCSS('background-image', customFill)
    await page.locator('#control-color').fill('var(--ui-light-panel-title)')
    await page.locator('#control-color').press('Tab')
    const variableFill = await fill.evaluate((element) => getComputedStyle(element).backgroundImage)
    await page.locator('#control-color').fill('rgb(85, 74, 52)')
    await page.locator('#control-color').press('Tab')
    await expect(fill).toHaveCSS('background-image', variableFill)
    await page.locator('#control-height').press('End')
    await page.locator('#control-height').press('Tab')
    await expect(track).toHaveCSS('height', '48px')
    await page.locator('label[for="control-shadow"]').click()
    await expect(track).toHaveCSS('box-shadow', 'none')
    await expect(fill).toHaveCSS('box-shadow', 'none')
})

test('BarTrack Default Controls preserve the separate background primitive', async ({ page }) => {
    await page.goto('/?path=/story/shared-common-bartrack--default')
    const preview = page.frameLocator('#storybook-preview-iframe')
    const track = preview.getByTestId('track-default')
    await expect(track).toBeVisible()
    await expect(track.locator('.game-bar__fill')).toHaveCount(0)
    await page.getByRole('tab', { name: /^Controls/ }).click()
    await page.locator('#control-color').fill('rgb(64, 82, 110)')
    await page.locator('#control-color').press('Tab')
    await expect(track).toHaveCSS('background-color', 'rgb(64, 82, 110)')
    await page.locator('#control-height').press('End')
    await page.locator('#control-height').press('Tab')
    await expect(track).toHaveCSS('height', '48px')
    await page.locator('label[for="control-shadow"]').click()
    await expect(track).toHaveCSS('box-shadow', 'none')
})
