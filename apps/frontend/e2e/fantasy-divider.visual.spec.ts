import { expect, type Locator, type Page, test } from '@playwright/test'

import {
    readScreenshotPixels,
    screenshotPixel,
    type ScreenshotPixels,
} from './fantasy-border-pixels'

const storyId = 'shared-external-fantasy-ui-borders-fantasydivider'
const variants = [
    { key: '000', height: 22, cap: 16, opaqueY: 0, lineY: 8 },
    { key: '001', height: 22, cap: 2, opaqueY: 8, lineY: 8 },
    { key: '002', height: 10, cap: 2, opaqueY: 0, lineY: 2 },
    { key: '003', height: 18, cap: 20, opaqueY: 6, lineY: 6 },
    { key: '004', height: 14, cap: 24, opaqueY: 4, lineY: 4 },
    { key: '005', height: 18, cap: 24, opaqueY: 6, lineY: 6 },
] as const

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
    await expect(page.locator('body')).toHaveCSS('background-color', background)
    await page.evaluate(async () => {
        await document.fonts.ready
        const sources = new Set<string>()
        for (const element of document.querySelectorAll('.fantasy-divider')) {
            for (const pseudo of ['::before', '::after']) {
                const value = getComputedStyle(element, pseudo).borderImageSource
                const match = value.match(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/)
                const src = match?.[1] ?? match?.[2] ?? match?.[3]
                if (src) sources.add(src)
            }
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
    for (const divider of await stage.locator('.fantasy-divider').all()) {
        expect(
            await divider.evaluate(
                (element) => element.scrollWidth <= Math.ceil(element.getBoundingClientRect().width)
            )
        ).toBe(true)
    }
}

async function pixelFixture(
    divider: Locator,
    width: number,
    color = 'red'
): Promise<ScreenshotPixels> {
    await divider.evaluate(
        (element, options) => {
            const host = element as HTMLElement
            host.style.width = `${options.width}px`
            host.style.backgroundColor = 'white'
            host.style.color = options.color
        },
        { width, color }
    )
    return readScreenshotPixels(divider)
}

function rightCap(image: ScreenshotPixels, width: number): number[] {
    const result: number[] = []
    for (let y = 0; y < image.height; y += 1) {
        const offset = (y * image.width + image.width - width) * 4
        result.push(...image.pixels.slice(offset, offset + width * 4))
    }
    return result
}

function horizontallyFlipped(image: ScreenshotPixels): number[] {
    const result: number[] = []
    for (let y = 0; y < image.height; y += 1) {
        for (let x = image.width - 1; x >= 0; x -= 1) {
            result.push(...screenshotPixel(image, x, y))
        }
    }
    return result
}

function joinedHalves(left: ScreenshotPixels, right: ScreenshotPixels): number[] {
    const result: number[] = []
    for (let y = 0; y < left.height; y += 1) {
        const leftOffset = y * left.width * 4
        const rightOffset = y * right.width * 4
        result.push(...left.pixels.slice(leftOffset, leftOffset + left.width * 4))
        result.push(...right.pixels.slice(rightOffset, rightOffset + right.width * 4))
    }
    return result
}

for (const width of [1280, 390, 320]) {
    for (const section of ['default', 'variants', 'directions', 'colors', 'sizes']) {
        test(`FantasyDivider ${section} at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 1000 })
            await page.goto(`/iframe.html?id=${storyId}--${section}&viewMode=story`)
            const stage = page.getByTestId('fantasy-divider-story')
            await expect(stage).toBeVisible()
            await ready(page)
            await assertFits(stage, width)
            await expect(stage).toHaveScreenshot(`fantasy-divider-${section}-${width}.png`)
        })
    }
}

test('FantasyDivider renders all six independent solid and fade pairs', async ({ page }) => {
    await page.goto(`/iframe.html?id=${storyId}--variants&viewMode=story`)
    await expect(page.getByTestId('fantasy-divider-story').getByRole('separator')).toHaveCount(12)
    for (const { key, height } of variants) {
        for (const mode of ['solid', 'fade']) {
            const divider = page.getByTestId(`divider-${key}-${mode}`)
            await expect(divider).toHaveAttribute('data-fantasy-divider', `divider-${key}`)
            await expect(divider).toHaveAttribute(
                'data-fantasy-divider-fade',
                String(mode === 'fade')
            )
            await expect(divider).toHaveCSS('height', `${height}px`)
        }
    }
})

test('FantasyDivider paints exact colors and alpha without coloring neighboring content', async ({
    page,
}) => {
    await page.goto(`/iframe.html?id=${storyId}--colors&viewMode=story`)
    await expect(page.getByTestId('divider-color-red')).toBeVisible()
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
        const pixels = await readScreenshotPixels(page.getByTestId(`divider-color-${name}`))
        expect(pixels.width).toBe(96)
        expect(pixels.height).toBe(22)
        const stroke = screenshotPixel(pixels, 95, 0)
        expected.forEach((channel, index) => {
            expect(Math.abs(stroke[index]! - channel)).toBeLessThanOrEqual(1)
        })
        const neighbor = await readScreenshotPixels(
            page.getByTestId(`divider-probe-${name}`).locator('.divider-color-content')
        )
        expect(screenshotPixel(neighbor, 10, 10)).toEqual([0, 0, 255, 255])
    }
    await page.getByTestId('divider-probe-variable').evaluate((element) => {
        ;(element as HTMLElement).style.setProperty('--divider-demo-color', 'rgb(0, 255, 255)')
    })
    const changed = await readScreenshotPixels(page.getByTestId('divider-color-variable'))
    expect(screenshotPixel(changed, 95, 0)).toEqual([0, 255, 255, 255])
    const neighbor = await readScreenshotPixels(page.getByTestId('divider-color-red'))
    expect(screenshotPixel(neighbor, 95, 0)).toEqual([255, 0, 0, 255])
})

test('FantasyDivider preserves the authored fade gradient in actual PNG output', async ({
    page,
}) => {
    await page.goto(`/iframe.html?id=${storyId}--variants&viewMode=story`)
    await expect(page.getByTestId('divider-000-fade')).toBeVisible()
    await ready(page)
    const pixels = await pixelFixture(page.getByTestId('divider-000-fade'), 96)
    for (const [x, sourceAlpha] of [
        [0, 0],
        [1, 5],
        [24, 127],
        [47, 250],
        [48, 255],
    ]) {
        const actual = screenshotPixel(pixels, x!, 8)
        const expected = [255, 255 - sourceAlpha!, 255 - sourceAlpha!, 255]
        expected.forEach((channel, index) => {
            expect(Math.abs(actual[index]! - channel)).toBeLessThanOrEqual(1)
        })
    }
})

test('FantasyDivider left end reflects the right ornament for all six shapes', async ({ page }) => {
    await page.goto(`/iframe.html?id=${storyId}--directions&viewMode=story`)
    await expect(page.getByTestId('divider-000-normal')).toBeVisible()
    await ready(page)
    for (const { key, height } of variants) {
        const normal = page.getByTestId(`divider-${key}-normal`)
        const mirrored = page.getByTestId(`divider-${key}-mirrored`)
        await expect(normal).toHaveAttribute('data-fantasy-divider-ends', 'right')
        await expect(mirrored).toHaveAttribute('data-fantasy-divider-ends', 'left')
        await expect(mirrored).toHaveCSS('transform', 'none')
        const forwardPixels = await pixelFixture(normal, 96)
        const mirroredPixels = await pixelFixture(mirrored, 96)
        expect(mirroredPixels.width).toBe(96)
        expect(mirroredPixels.height).toBe(height)
        expect(mirroredPixels.pixels).toEqual(horizontallyFlipped(forwardPixels))
    }
})

test('FantasyDivider keeps every solid and fade cap intact when the line grows', async ({
    page,
}) => {
    await page.goto(`/iframe.html?id=${storyId}--variants&viewMode=story`)
    await expect(page.getByTestId('divider-000-solid')).toBeVisible()
    await ready(page)
    for (const { key, height, cap, opaqueY } of variants) {
        for (const mode of ['solid', 'fade']) {
            const divider = page.getByTestId(`divider-${key}-${mode}`)
            const native = await pixelFixture(divider, 96)
            const wide = await pixelFixture(divider, 240)
            expect(native.height).toBe(height)
            expect(wide.height).toBe(height)
            expect(wide.width).toBe(240)
            expect(screenshotPixel(native, 95, opaqueY)).toEqual([255, 0, 0, 255])
            expect(rightCap(wide, cap)).toEqual(rightCap(native, cap))
            await expect(divider).toHaveCSS('min-width', `${cap + 1}px`)
        }
    }
})

test('FantasyDivider supports fluid width and protects its native minimum', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 })
    await page.goto(`/iframe.html?id=${storyId}--sizes&viewMode=story`)
    await expect(page.getByTestId('divider-size-min')).toBeVisible()
    await ready(page)
    const minimum = await page.getByTestId('divider-size-min').boundingBox()
    expect(minimum!.width).toBe(17)
    expect(minimum!.height).toBe(22)
    const bothMinimum = await page.getByTestId('divider-size-both-min').boundingBox()
    expect(bothMinimum!.width).toBe(34)
    expect(bothMinimum!.height).toBe(22)
    const fluid = page.getByTestId('divider-size-fluid')
    const widths = await fluid.evaluate((element) => ({
        actual: element.getBoundingClientRect().width,
        container: element.parentElement!.getBoundingClientRect().width,
    }))
    expect(widths.actual).toBe(widths.container)
    await expect(fluid).toHaveCSS('height', '22px')
    await assertFits(page.getByTestId('fantasy-divider-story'), 320)
})

test('FantasyDivider both ends preserve native caps and join without overlap for all shapes', async ({
    page,
}) => {
    await page.goto(`/iframe.html?id=${storyId}--directions&viewMode=story`)
    await expect(page.getByTestId('divider-000-both')).toBeVisible()
    await ready(page)
    for (const { key, height, cap, lineY } of variants) {
        const left = page.getByTestId(`divider-${key}-mirrored`)
        const right = page.getByTestId(`divider-${key}-normal`)
        const both = page.getByTestId(`divider-${key}-both`)
        await expect(both).toHaveAttribute('data-fantasy-divider-ends', 'both')
        const samples: ScreenshotPixels[] = []
        for (const width of [192, 240, 241]) {
            const leftPixels = await pixelFixture(left, Math.floor(width / 2))
            const rightPixels = await pixelFixture(right, Math.ceil(width / 2))
            const combined = await pixelFixture(both, width)
            expect(combined.width).toBe(width)
            expect(combined.height).toBe(height)
            expect(combined.pixels).toEqual(joinedHalves(leftPixels, rightPixels))
            samples.push(combined)
        }
        expect(rightCap(samples[2]!, cap)).toEqual(rightCap(samples[0]!, cap))
        expect(rightCap({ ...samples[2]!, pixels: horizontallyFlipped(samples[2]!) }, cap)).toEqual(
            rightCap({ ...samples[0]!, pixels: horizontallyFlipped(samples[0]!) }, cap)
        )
        await expect(both).toHaveCSS('min-width', `${2 * (cap + 1)}px`)
        const minimum = await pixelFixture(both, 0)
        expect(minimum.width).toBe(2 * (cap + 1))
        expect(minimum.height).toBe(height)
        const seam = await pixelFixture(both, 192, 'rgba(255, 0, 0, 0.5)')
        const once = screenshotPixel(seam, 95, lineY)
        const expected = [255, 127, 127, 255]
        expected.forEach((channel, index) => {
            expect(Math.abs(once[index]! - channel)).toBeLessThanOrEqual(1)
        })
        expect(screenshotPixel(seam, 96, lineY)).toEqual(once)
        const oddSeam = await pixelFixture(both, 241, 'rgba(255, 0, 0, 0.5)')
        expect(screenshotPixel(oddSeam, 119, lineY)).toEqual(once)
        expect(screenshotPixel(oddSeam, 120, lineY)).toEqual(once)
    }
})

test('FantasyDivider both faded ends retain the two authored gradients toward the center', async ({
    page,
}) => {
    await page.goto(`/iframe.html?id=${storyId}--directions&viewMode=story`)
    await expect(page.getByTestId('divider-000-both-fade')).toBeVisible()
    await ready(page)
    const gradient = await pixelFixture(page.getByTestId('divider-000-both-fade'), 192)
    const native = await pixelFixture(page.getByTestId('divider-000-both'), 192)
    expect(gradient.height).toBe(native.height)
    for (const [distance, alpha] of [
        [0, 0],
        [1, 5],
        [24, 127],
        [47, 250],
        [48, 255],
    ]) {
        for (const x of [95 - distance!, 96 + distance!]) {
            const actual = screenshotPixel(gradient, x, 8)
            const expected = [255, 255 - alpha!, 255 - alpha!, 255]
            expected.forEach((channel, index) => {
                expect(Math.abs(actual[index]! - channel)).toBeLessThanOrEqual(1)
            })
        }
    }
    for (const { key, height, cap } of variants) {
        const faded = await pixelFixture(page.getByTestId(`divider-${key}-both-fade`), 192)
        const expanded = await pixelFixture(page.getByTestId(`divider-${key}-both-fade`), 240)
        expect(faded.height).toBe(height)
        expect(rightCap(expanded, cap)).toEqual(rightCap(faded, cap))
        const mirroredFaded = { ...faded, pixels: horizontallyFlipped(faded) }
        const mirroredExpanded = { ...expanded, pixels: horizontallyFlipped(expanded) }
        expect(rightCap(mirroredExpanded, cap)).toEqual(rightCap(mirroredFaded, cap))
    }
})
