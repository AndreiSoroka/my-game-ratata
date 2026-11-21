import { expect, type Locator, type Page, test } from '@playwright/test'

import {
    readScreenshotPixels,
    screenshotCorner,
    screenshotPixel,
    type ScreenshotPixels,
} from './fantasy-border-pixels'

const storyId = 'shared-external-fantasy-ui-borders-fantasypanel'

async function ready(page: Page): Promise<void> {
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(133, 93, 48)')
    await page.evaluate(async () => {
        await document.fonts.ready
        const sources = new Set<string>()
        for (const element of document.querySelectorAll('.fantasy-panel')) {
            const value = getComputedStyle(element, '::before').borderImageSource
            const match = value.match(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/)
            const src = match?.[1] ?? match?.[2] ?? match?.[3]
            if (src) sources.add(src)
        }
        await Promise.all([
            ...Array.from(document.images, (image) => image.decode()),
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
    for (const panel of await stage.locator('.fantasy-panel').all()) {
        expect(
            await panel.evaluate(
                (element) => element.scrollWidth <= Math.ceil(element.getBoundingClientRect().width)
            )
        ).toBe(true)
    }
}

/** Isolate decoration geometry; public prop colors and actual slotted content have separate pixel checks. */
async function panelPixels(
    panel: Locator,
    width: number,
    height: number
): Promise<ScreenshotPixels> {
    await panel.evaluate(
        (element, dimensions) => {
            const host = element as HTMLElement
            Object.assign(host.style, {
                width: `${dimensions.width}px`,
                height: `${dimensions.height}px`,
                padding: '0px',
                minWidth: '0px',
                minHeight: '0px',
                color: 'red',
                left: '0px',
                top: '0px',
            })
            ;(host.closest('section') as HTMLElement).style.backgroundColor = 'white'
            host.style.setProperty('--fantasy-panel-color', 'red')
            for (const child of Array.from(host.children)) {
                if (child.tagName.toLowerCase() !== 'svg')
                    (child as HTMLElement).style.visibility = 'hidden'
            }
            for (const child of Array.from(host.childNodes)) {
                if (child.nodeType === Node.TEXT_NODE) child.textContent = ''
            }
            const flood = host.querySelector<SVGFEFloodElement>('feFlood')
            if (flood) flood.style.floodColor = 'red'
            // Grid tracks can have fractional positions; align the native pixel fixture without scaling it.
            const bounds = host.getBoundingClientRect()
            host.style.left = `${Math.floor(bounds.x) - bounds.x}px`
            host.style.top = `${Math.floor(bounds.y) - bounds.y}px`
        },
        { width, height }
    )
    return readScreenshotPixels(panel)
}

async function sourcePixels(panel: Locator): Promise<ScreenshotPixels> {
    return panel.evaluate(async (element) => {
        const source = getComputedStyle(element, '::before').borderImageSource
        const match = source.match(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/)
        const url = match?.[1] ?? match?.[2] ?? match?.[3]
        if (!url) throw new Error('Panel source image is missing')
        const image = new Image()
        image.src = url
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')
        if (!context) throw new Error('A 2D canvas is required for panel source pixels')
        context.drawImage(image, 0, 0)
        return {
            width: canvas.width,
            height: canvas.height,
            pixels: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data),
        }
    })
}

function redOnWhite(source: ScreenshotPixels): number[] {
    const pixels: number[] = []
    for (let index = 0; index < source.pixels.length; index += 4) {
        const alpha = source.pixels[index + 3]!
        pixels.push(255, 255 - alpha, 255 - alpha, 255)
    }
    return pixels
}

for (const width of [1280, 390, 320]) {
    for (const section of [
        'default',
        'variants',
        'appearances',
        'colors',
        'composition',
        'sizes',
    ]) {
        test(`FantasyPanel ${section} at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 1000 })
            await page.goto(`/iframe.html?id=${storyId}--${section}&viewMode=story`)
            const stage = page.getByTestId(
                section === 'default' ? 'panel-default' : 'fantasy-panel-story'
            )
            await expect(stage).toBeVisible()
            await ready(page)
            await assertFits(stage, width)
            await expect(stage).toHaveScreenshot(`fantasy-panel-${section}-${width}.png`)
        })
    }
}

test('FantasyPanel catalog renders all 32 solid panel variants', async ({ page }) => {
    await page.goto(`/iframe.html?id=${storyId}--variants&viewMode=story`)
    const panels = page.getByTestId('fantasy-panel-story').locator('.fantasy-panel')
    await expect(panels).toHaveCount(32)
    for (let index = 0; index < 32; index += 1) {
        const key = `panel-${String(index).padStart(3, '0')}`
        await expect(page.locator(`.fantasy-panel[data-fantasy-panel="${key}"]`)).toHaveAttribute(
            'data-fantasy-panel-appearance',
            'solid'
        )
    }
})

test('FantasyPanel tints only its surface with exact CSS colors and alpha', async ({ page }) => {
    await page.goto(`/iframe.html?id=${storyId}--colors&viewMode=story`)
    await expect(page.getByTestId('panel-color-red')).toBeVisible()
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
        const pixels = await readScreenshotPixels(page.getByTestId(`panel-color-${name}`))
        expect(pixels.width).toBe(96)
        expect(pixels.height).toBe(96)
        const ornament = screenshotPixel(pixels, 0, 0)
        const center = screenshotPixel(pixels, 24, 24)
        expected.forEach((channel, index) => {
            expect(Math.abs(ornament[index]! - channel)).toBeLessThanOrEqual(1)
            expect(Math.abs(center[index]! - channel)).toBeLessThanOrEqual(1)
        })
        expect(screenshotPixel(pixels, 12, 0)).toEqual([255, 255, 255, 255])
        expect(screenshotPixel(pixels, 48, 48)).toEqual([0, 0, 255, 255])
    }
    await page.getByTestId('panel-probe-variable').evaluate((element) => {
        ;(element as HTMLElement).style.setProperty('--panel-demo-color', 'rgb(0, 255, 255)')
    })
    const changed = await readScreenshotPixels(page.getByTestId('panel-color-variable'))
    expect(screenshotPixel(changed, 0, 0)).toEqual([0, 255, 255, 255])
    expect(screenshotPixel(changed, 48, 48)).toEqual([0, 0, 255, 255])
    const neighbor = await readScreenshotPixels(page.getByTestId('panel-color-red'))
    expect(screenshotPixel(neighbor, 0, 0)).toEqual([255, 0, 0, 255])
})

test('FantasyPanel keeps all three source opacity patterns', async ({ page }) => {
    await page.goto(`/iframe.html?id=${storyId}--appearances&viewMode=story`)
    await expect(page.getByTestId('panel-appearance-solid')).toBeVisible()
    await ready(page)
    for (const [appearance, ornamentAlpha, centerAlpha] of [
        ['solid', 255, 255],
        ['transparent-border', 127, 255],
        ['transparent-center', 255, 127],
    ] as const) {
        const panel = page.getByTestId(`panel-appearance-${appearance}`)
        await expect(panel).toHaveAttribute('data-fantasy-panel-appearance', appearance)
        for (const [width, height] of [
            [48, 48],
            [160, 96],
        ]) {
            const actual = await panelPixels(panel, width!, height!)
            expect(screenshotPixel(actual, 0, 0)).toEqual([
                255,
                255 - ornamentAlpha,
                255 - ornamentAlpha,
                255,
            ])
            expect(screenshotPixel(actual, 12, 0)).toEqual([255, 255, 255, 255])
            expect(
                screenshotPixel(actual, Math.floor(width! / 2), Math.floor(height! / 2))
            ).toEqual([255, 255 - centerAlpha, 255 - centerAlpha, 255])
        }
    }
})

test('FantasyPanel colors the ornament and the full surface independently', async ({ page }) => {
    for (const [appearance, ornament, fill] of [
        ['solid', [255, 0, 0, 255], [0, 0, 255, 255]],
        ['transparent-border', [255, 128, 128, 255], [0, 0, 255, 255]],
        ['transparent-center', [255, 0, 0, 255], [128, 128, 255, 255]],
    ] as const) {
        await page.goto(
            `/iframe.html?id=${storyId}--default&viewMode=story&args=appearance:${appearance};borderColor:red;backgroundColor:blue`
        )
        const panel = page.getByTestId('panel-default')
        await expect(panel).toHaveAttribute('data-fantasy-panel-appearance', appearance)
        await ready(page)
        await page.locator('#storybook-root > div').evaluate((host) => {
            ;(host as HTMLElement).style.backgroundColor = 'white'
        })
        const pixels = await readScreenshotPixels(panel)
        expect(screenshotPixel(pixels, 0, 0)).toEqual(ornament)
        expect(screenshotPixel(pixels, 12, 0)).toEqual([255, 255, 255, 255])
        expect(screenshotPixel(pixels, 24, 4)).toEqual(fill)
        expect(screenshotPixel(pixels, 24, 24)).toEqual(fill)
    }
})

test('FantasyPanel native source alpha and corners match all 32', async ({ page }) => {
    await page.goto(`/iframe.html?id=${storyId}--variants&viewMode=story`)
    await expect(page.getByTestId('fantasy-panel-story')).toBeVisible()
    await ready(page)
    for (let index = 0; index < 32; index += 1) {
        const key = `panel-${String(index).padStart(3, '0')}`
        const panel = page.locator(`.fantasy-panel[data-fantasy-panel="${key}"]`)
        const source = await sourcePixels(panel)
        expect(source.width).toBe(48)
        expect(source.height).toBe(48)
        const actual = await panelPixels(panel, 48, 48)
        expect(actual.width).toBe(48)
        expect(actual.height).toBe(48)
        const expected = { ...source, pixels: redOnWhite(source) }
        expect(actual.pixels, key).toEqual(expected.pixels)
        const expanded = await panelPixels(panel, 160, 96)
        expect(expanded.width).toBe(160)
        expect(expanded.height).toBe(96)
        expect(screenshotCorner(expanded, 22)).toEqual(screenshotCorner(expected, 22))
        await panel.evaluate((element) => ((element as HTMLElement).style.visibility = 'hidden'))
    }
})

test('FantasyPanel preserves 020/025 corners and minimums', async ({ page }) => {
    await page.goto(`/iframe.html?id=${storyId}--sizes&viewMode=story`)
    await expect(page.getByTestId('panel-size-020-small')).toBeVisible()
    await ready(page)
    for (const key of ['020', '025']) {
        const corners: number[][] = []
        for (const size of ['small', 'wide', 'tall']) {
            const panel = page.getByTestId(`panel-size-${key}-${size}`)
            const geometry = await panel.evaluate((element) => {
                const host = getComputedStyle(element)
                const decoration = getComputedStyle(element, '::before')
                return {
                    minWidth: host.minWidth,
                    minHeight: host.minHeight,
                    slice: decoration.borderImageSlice,
                    width: decoration.borderImageWidth,
                }
            })
            expect(geometry).toEqual({
                minWidth: '44px',
                minHeight: '44px',
                slice: '22',
                width: '22px',
            })
            corners.push(screenshotCorner(await readScreenshotPixels(panel), 22))
        }
        expect(corners[1]).toEqual(corners[0])
        expect(corners[2]).toEqual(corners[0])
        const minimum = await page.getByTestId(`panel-size-${key}-min`).boundingBox()
        expect(minimum!.width).toBe(44)
        expect(minimum!.height).toBe(44)
    }
})

test('FantasyPanel multiplies color and center alpha once', async ({ page }) => {
    await page.goto(
        `/iframe.html?id=${storyId}--default&viewMode=story&args=appearance:transparent-center;borderColor:currentColor;backgroundColor:currentColor`
    )
    const panel = page.getByTestId('panel-default')
    await expect(panel).toHaveAttribute('data-fantasy-panel-appearance', 'transparent-center')
    await ready(page)
    await panel.evaluate((element) => {
        ;(element as HTMLElement).style.color = 'rgba(255, 0, 0, 0.5)'
        ;(element.parentElement as HTMLElement).style.backgroundColor = 'white'
    })
    const pixels = await readScreenshotPixels(panel)
    for (const [x, y, green] of [
        [0, 0, 128],
        [24, 24, 191],
    ] as const) {
        const actual = screenshotPixel(pixels, x, y)
        ;[255, green, green, 255].forEach((channel, index) => {
            expect(Math.abs(actual[index]! - channel)).toBeLessThanOrEqual(1)
        })
    }
    expect(screenshotPixel(pixels, 12, 0)).toEqual([255, 255, 255, 255])
})
