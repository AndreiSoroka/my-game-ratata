import { expect, type Locator, type Page } from '@playwright/test'

/** Wait for the native canvas, font and CSS border-image sources before pixel comparisons. */
export async function readyUiStory(page: Page, waitForCanvas = false): Promise<void> {
    const canvas = await page.evaluate(() => {
        const probe = document.createElement('span')
        probe.hidden = true
        probe.style.backgroundColor = 'var(--ui-light-panel-parchment)'
        document.body.append(probe)
        const color = getComputedStyle(probe).backgroundColor
        probe.remove()
        return color
    })
    if (waitForCanvas) {
        await expect(page.locator('body')).toHaveCSS('background-color', canvas)
    }
    await page.evaluate(async () => {
        await document.fonts.ready
        const sources = new Set<string>()
        for (const element of document.querySelectorAll(
            '.fantasy-border, .fantasy-divider, .fantasy-panel, .ui-button'
        )) {
            for (const pseudo of [null, '::before', '::after']) {
                const source = getComputedStyle(element, pseudo).borderImageSource
                const match = source.match(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/)
                const url = match?.[1] ?? match?.[2] ?? match?.[3]
                if (url) {
                    sources.add(url)
                }
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

export function uiStoryUrl(story: string): string {
    const query = new URLSearchParams({
        id: story,
        viewMode: 'story',
        globals: 'backgrounds.value:parchment',
    })
    return `/iframe.html?${query}`
}

export async function expectUiFits(stage: Locator, width: number): Promise<void> {
    const bounds = await stage.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
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
