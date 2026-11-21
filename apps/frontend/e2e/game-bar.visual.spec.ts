import { expect, test } from '@playwright/test'

import { expectUiFits, readyUiStory } from './ui-story-ready'

const catalogs = [
    {
        name: 'bar-track',
        story: 'shared-common-bartrack',
        defaultId: 'track-default',
        sections: ['default', 'colors', 'sizes'],
    },
    {
        name: 'bar-fill',
        story: 'shared-common-barfill',
        defaultId: 'fill-default',
        sections: ['default', 'colors', 'sizes'],
    },
    {
        name: 'game-bar',
        story: 'shared-common-gamebar',
        defaultId: 'game-bar-default',
        sections: ['default', 'with-value', 'resources', 'values', 'colors', 'sizes'],
    },
]

function barStoryUrl(story: string): string {
    return `/iframe.html?id=${story}&viewMode=story`
}

for (const width of [1280, 390, 320]) {
    for (const catalog of catalogs) {
        for (const section of catalog.sections) {
            const subject =
                section === 'default'
                    ? `#storybook-root > div > [data-testid="${catalog.defaultId}"]`
                    : `[data-testid="${catalog.name}-story"]`
            const background = section === 'default' ? 'rgba(0, 0, 0, 0)' : 'rgb(243, 228, 199)'

            test(`${catalog.name} ${section} at ${width}px`, async ({ page }) => {
                await page.setViewportSize({ width, height: 1000 })
                await page.goto(barStoryUrl(`${catalog.story}--${section}`))
                const stage = page.locator(subject)
                await expect(stage).toBeVisible()
                await expect(page.locator('#storybook-root > div')).toHaveCSS(
                    'background-color',
                    background
                )
                await readyUiStory(page)
                await expectUiFits(stage, width)
                await expect(stage).toHaveScreenshot(`${catalog.name}-${section}-${width}.png`)
            })
        }
    }
}

test('GameBar fills the track proportionally with the same one-pixel rim on each edge', async ({
    page,
}) => {
    await page.goto(barStoryUrl('shared-common-gamebar--values'))
    const stage = page.getByTestId('game-bar-story')
    await expect(stage).toBeVisible()
    await readyUiStory(page)
    for (const value of [0, 1, 25, 50, 100]) {
        const bar = page.getByTestId(`game-bar-value-${value}`)
        await expect(bar).toHaveAttribute('role', 'progressbar')
        await expect(bar).toHaveAttribute('aria-valuemin', '0')
        await expect(bar).toHaveAttribute('aria-valuemax', '100')
        await expect(bar).toHaveAttribute('aria-valuenow', String(value))
        const geometry = await bar.evaluate((element, amount) => {
            const fill = element.querySelector<HTMLElement>('.bar-fill')!
            const content = fill.parentElement!.getBoundingClientRect()
            const track = element.querySelector('.bar-track')!.getBoundingClientRect()
            const filled = fill.getBoundingClientRect()
            return {
                fillWidth: filled.width,
                contentWidth: content.width,
                fillRadius: getComputedStyle(fill).borderTopLeftRadius,
                rim: [
                    content.top - track.top,
                    track.bottom - content.bottom,
                    content.left - track.left,
                    track.right - content.right,
                ],
                verticalGap:
                    amount > 0 ? [filled.top - track.top, track.bottom - filled.bottom] : [],
            }
        }, value)
        expect(geometry.fillWidth).toBeCloseTo((geometry.contentWidth * value) / 100, 1)
        expect(geometry.fillWidth).toBeLessThanOrEqual(geometry.contentWidth)
        expect(geometry.fillRadius).toBe('3px')
        expect(geometry.rim).toEqual([1, 1, 1, 1])
        expect(geometry.verticalGap).toEqual(value > 0 ? [1, 1] : [])
    }
    const empty = page.getByTestId('game-bar-value-0').locator('.game-bar__fill')
    await expect(empty).toBeHidden()
    expect(await empty.evaluate((element) => element.getBoundingClientRect().width)).toBe(0)

    const partial = page.getByTestId('game-bar-value-50').locator('.game-bar__fill')
    await expect(partial).toHaveCSS('box-shadow', /-1px 0px 0px 0px inset$/)
    const full = page.getByTestId('game-bar-value-100').locator('.game-bar__fill')
    await expect(full).toHaveCSS('box-shadow', 'none')
})

test('resource presets have distinct fills and a recessed track with small corners', async ({
    page,
}) => {
    await page.goto(barStoryUrl('shared-common-gamebar--resources'))
    await expect(page.getByTestId('game-bar-health')).toBeVisible()
    await readyUiStory(page)
    const fills = []
    for (const resource of ['health', 'mana', 'energy']) {
        const bar = page.getByTestId(`game-bar-${resource}`)
        const fill = bar.locator('.game-bar__fill')
        const appearance = await bar.evaluate((element) => {
            const fill = element.querySelector<HTMLElement>('.game-bar__fill')!
            const track = element.querySelector('.bar-track')!
            const style = getComputedStyle(track)
            return {
                fill: getComputedStyle(fill).backgroundImage,
                radius: style.borderTopLeftRadius,
                shadow: style.boxShadow,
            }
        })
        fills.push(appearance.fill)
        expect(appearance.fill).not.toBe('none')
        expect(appearance.shadow).toContain('inset')
        expect(appearance.radius).toBe('4px')
        await expect(fill).toBeVisible()
    }
    expect(new Set(fills).size).toBe(3)
})

test('GameBar shows the value centered inside the track at partial fill', async ({ page }) => {
    await page.goto(barStoryUrl('shared-common-gamebar--with-value'))
    const bar = page.getByRole('progressbar')
    await expect(bar).toHaveAttribute('aria-valuenow', '18')
    await expect(bar).toHaveAttribute('aria-valuemax', '30')
    await readyUiStory(page)
    await expect(bar.locator('.bar-track')).toHaveText('18 / 30')
    const positions = await bar.evaluate((element) => {
        const track = element.querySelector('.bar-track')!.getBoundingClientRect()
        const label = element.querySelector('.game-bar__label')!
        const range = document.createRange()
        range.selectNodeContents(label)
        const text = range.getBoundingClientRect()
        return {
            horizontal: text.left + text.width / 2 - (track.left + track.width / 2),
            vertical: text.top + text.height / 2 - (track.top + track.height / 2),
        }
    })
    expect(Math.abs(positions.horizontal)).toBeLessThan(1)
    expect(Math.abs(positions.vertical)).toBeLessThan(2)
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
    await expect(track.locator('.bar-fill')).toHaveCount(0)
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

test('BarFill Default Controls style the filling without a track', async ({ page }) => {
    await page.goto('/?path=/story/shared-common-barfill--default')
    const preview = page.frameLocator('#storybook-preview-iframe')
    const fill = preview.getByTestId('fill-default')
    await expect(fill).toBeVisible()
    await expect(preview.locator('.bar-track')).toHaveCount(0)
    await expect(fill).toHaveCSS('border-top-left-radius', '4px')
    await page.getByRole('tab', { name: /^Controls/ }).click()
    const oldFill = await fill.evaluate((element) => getComputedStyle(element).backgroundImage)
    await page.locator('#control-color').fill('rgb(40, 118, 105)')
    await page.locator('#control-color').press('Tab')
    await expect(fill).not.toHaveCSS('background-image', oldFill)
    await page.locator('#control-height').press('End')
    await expect(fill).toHaveCSS('height', '48px')
    await page.locator('label[for="control-shadow"]').click()
    await expect(fill).toHaveCSS('box-shadow', 'none')
})
