import { expect, type Locator, type Page, test } from '@playwright/test'

import { readScreenshotPixels, screenshotCorner, screenshotPixel } from './fantasy-border-pixels'

const storyId = 'shared-external-fantasy-ui-borders-fantasyborder'

async function ready(page: Page): Promise<void> {
    const background = await page.evaluate(() => {
        const probe = document.createElement('span')
        probe.hidden = true
        probe.style.backgroundColor = 'var(--ui-light-button-wood-bottom)'
        document.body.append(probe)
        const color = getComputedStyle(probe).backgroundColor
        probe.remove()
        return color
    })
    // The native background addon applies after the story mounts.
    await expect(page.locator('body')).toHaveCSS('background-color', background)
    await page.evaluate(async () => {
        await document.fonts.ready
        const images = Array.from(document.images, (image) => image.decode())
        const sources = new Set<string>()
        for (const element of document.querySelectorAll('.fantasy-border')) {
            const source = getComputedStyle(element, '::before').borderImageSource
            const match = source.match(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/)
            const url = match?.[1] ?? match?.[2] ?? match?.[3]
            if (url) {
                sources.add(url)
            }
        }
        await Promise.all([
            ...images,
            ...Array.from(sources, async (src) => {
                const image = new Image()
                image.src = src
                await image.decode()
            }),
        ])
    })
}

async function assertFits(stage: Locator, width: number): Promise<void> {
    const bounds = await stage.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    expect(
        await stage.page().evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    ).toBe(true)
    for (const border of await stage.locator('.fantasy-border').all()) {
        // Decoration crosses the transparent physical border, staying within its border box.
        expect(
            await border.evaluate(
                (element) => element.scrollWidth <= Math.ceil(element.getBoundingClientRect().width)
            )
        ).toBe(true)
    }
}

for (const width of [1280, 390, 320]) {
    for (const section of ['default', 'variants', 'colors', 'composition', 'sizes']) {
        test(`FantasyBorder ${section} at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 1000 })
            await page.goto(`/iframe.html?id=${storyId}--${section}&viewMode=story`)
            const stage = page.getByTestId(
                section === 'default' ? 'border-default' : 'fantasy-border-story'
            )
            await expect(stage).toBeVisible()
            await ready(page)
            await assertFits(stage, width)
            await expect(stage).toHaveScreenshot(`fantasy-border-${section}-${width}.png`, {
                threshold: 0,
            })
        })
    }
}

test('FantasyBorder catalog renders all 32 requested variants', async ({ page }) => {
    await page.goto(`/iframe.html?id=${storyId}--variants&viewMode=story`)
    const stage = page.getByTestId('fantasy-border-story')
    await expect(stage.locator('.fantasy-border')).toHaveCount(32)
    for (let index = 0; index < 32; index += 1) {
        const key = `border-${String(index).padStart(3, '0')}`
        await expect(page.getByTestId(key)).toHaveAttribute('data-fantasy-border', key)
    }
})

test('FantasyBorder paints exact CSS colors and alpha without tinting slot content', async ({
    page,
}) => {
    await page.goto(`/iframe.html?id=${storyId}--colors&viewMode=story`)
    await expect(page.getByTestId('border-color-red')).toBeVisible()
    await ready(page)
    const probes = [
        ['red', [255, 0, 0, 255]],
        ['hex', [255, 0, 0, 255]],
        ['rgba', [255, 128, 128, 255]],
        ['current', [0, 128, 0, 255]],
        ['variable', [128, 0, 128, 255]],
        ['hsl', [255, 128, 0, 255]],
    ] as const
    for (const [name, expected] of probes) {
        const pixels = await readScreenshotPixels(page.getByTestId(`border-color-${name}`))
        expect(pixels.width).toBe(160)
        expect(pixels.height).toBe(80)
        // Source 026 has fully opaque pixels at the top midpoint; white is the known backdrop.
        const stroke = screenshotPixel(pixels, 80, 0)
        expected.forEach((channel, index) => {
            expect(Math.abs(stroke[index]! - channel)).toBeLessThanOrEqual(1)
        })
        expect(screenshotPixel(pixels, 80, 40)).toEqual([0, 0, 255, 255])
    }
    for (const [name, expected] of [
        ['white', [255, 255, 255, 255]],
        ['cream', [241, 221, 182, 255]],
        ['gold', [248, 243, 184, 255]],
        ['copper', [251, 193, 166, 255]],
    ] as const) {
        const pixels = await readScreenshotPixels(page.getByTestId(`border-theme-${name}`))
        expect(screenshotPixel(pixels, 80, 0)).toEqual(expected)
    }
    const variable = page.getByTestId('border-color-variable')
    await variable.evaluate((element) =>
        (element as HTMLElement).style.setProperty('--border-demo-color', 'rgb(0, 255, 255)')
    )
    const changed = await readScreenshotPixels(variable)
    expect(screenshotPixel(changed, 80, 0)).toEqual([0, 255, 255, 255])
    expect(screenshotPixel(changed, 80, 40)).toEqual([0, 0, 255, 255])
    const neighbor = await readScreenshotPixels(page.getByTestId('border-color-red'))
    expect(screenshotPixel(neighbor, 80, 0)).toEqual([255, 0, 0, 255])
})

test('FantasyBorder keeps the 020 and 025 corners fixed and enforces their minimum', async ({
    page,
}) => {
    await page.goto(`/iframe.html?id=${storyId}--sizes&viewMode=story`)
    await expect(page.getByTestId('border-size-020-small')).toBeVisible()
    await ready(page)
    for (const variant of ['020', '025']) {
        const corners: number[][] = []
        for (const size of ['small', 'wide', 'tall']) {
            const border = page.getByTestId(`border-size-${variant}-${size}`)
            const geometry = await border.evaluate((element) => {
                const host = getComputedStyle(element)
                const decoration = getComputedStyle(element, '::before')
                return {
                    width: host.borderTopWidth,
                    minWidth: host.minWidth,
                    minHeight: host.minHeight,
                    slice: decoration.borderImageSlice,
                    imageWidth: decoration.borderImageWidth,
                }
            })
            expect(geometry).toEqual({
                width: '20px',
                minWidth: '40px',
                minHeight: '40px',
                slice: '20',
                imageWidth: '20px',
            })
            corners.push(screenshotCorner(await readScreenshotPixels(border), 20))
        }
        expect(corners[1]).toEqual(corners[0])
        expect(corners[2]).toEqual(corners[0])
        // A caller may request less space; the public wrapper still protects both full corners.
        const minimum = page.getByTestId(`border-size-${variant}-min`)
        const bounds = await minimum.boundingBox()
        expect(bounds!.width).toBe(40)
        expect(bounds!.height).toBe(40)
    }
})
