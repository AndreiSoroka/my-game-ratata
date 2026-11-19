import { createRequire } from 'node:module'

import { expect, type Page, test } from '@playwright/test'

import { lightUiColors } from '../src/shared/ui/theme/index'

const require = createRequire(import.meta.url)
const addonRequire = createRequire(require.resolve('@storybook/addon-a11y/package.json'))
const axeScript = addonRequire.resolve('axe-core/axe.min.js')
const storyId = 'interface-base-fantasy-ui-borders-fantasyborder'

async function resolvedColor(page: Page, reference: string): Promise<string> {
    return page.evaluate((color) => {
        const probe = document.createElement('div')
        probe.hidden = true
        probe.style.backgroundColor = color
        document.body.append(probe)
        const resolved = getComputedStyle(probe).backgroundColor
        probe.remove()
        return resolved
    }, reference)
}

test('Storybook previews omit app DevTools and pass the real accessibility scan', async ({
    page,
}) => {
    await page.goto(`/iframe.html?id=${storyId}--default&viewMode=story`)
    await expect(page.getByTestId('fantasy-border-story')).toBeVisible()
    const background = await resolvedColor(page, lightUiColors.button.wood.bottom)
    await expect(page.locator('body')).toHaveCSS('background-color', background)
    await page.evaluate(() => document.fonts.ready)
    await expect(page.locator('#__vue-devtools-container__')).toHaveCount(0)
    await expect(page.locator('.vue-devtools__anchor-btn')).toHaveCount(0)
    const toolingRequests = await page.evaluate(() =>
        [
            ...Array.from(document.scripts, (script) => script.src),
            ...performance.getEntriesByType('resource').map((resource) => resource.name),
        ].filter((src) => src.includes('vue-devtools-path') || src.includes('vue-inspector-path'))
    )
    expect(toolingRequests).toEqual([])
    await page.addScriptTag({ path: axeScript })
    const violations = await page.evaluate(async () => {
        type AxeViolation = {
            id: string
            nodes: { target: string[]; failureSummary?: string }[]
        }
        const scanner = window as typeof window & {
            axe: { run: (context: HTMLElement) => Promise<{ violations: AxeViolation[] }> }
        }
        // Stories are component previews; include the whole body, including stray tooling.
        const results = await scanner.axe.run(document.body)
        return results.violations.map(({ id, nodes }) => ({
            id,
            nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
        }))
    })
    expect(violations).toEqual([])
})

for (const [preset, reference, foreground] of [
    ['wood', lightUiColors.button.wood.bottom, lightUiColors.button.text],
    ['parchment', lightUiColors.panel.parchment, lightUiColors.panel.text],
    ['dark', 'var(--vt-c-black-soft)', lightUiColors.button.text],
] as const) {
    test(`FantasyBorder stories share one selectable ${preset} canvas`, async ({ page }) => {
        for (const section of ['default', 'variants', 'colors', 'composition', 'sizes']) {
            const query = new URLSearchParams({
                id: `${storyId}--${section}`,
                viewMode: 'story',
                globals: `backgrounds.value:${preset}`,
            })
            await page.goto(`/iframe.html?${query}`)
            const stage = page.getByTestId('fantasy-border-story')
            await expect(stage).toBeVisible()
            const background = await resolvedColor(page, reference)
            expect(background).not.toBe('rgba(0, 0, 0, 0)')
            await expect(page.locator('body')).toHaveCSS('background-color', background)
            await expect(stage).toHaveCSS('color', await resolvedColor(page, foreground))
            await expect(stage).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
            await expect(stage).toHaveCSS('background-image', 'none')
            const host = page.locator('#storybook-root > div').filter({ has: stage })
            await expect(host).toHaveCount(1)
            await expect(host).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
            await expect(host).toHaveCSS('background-image', 'none')
        }
    })
}

for (const colorScheme of ['light', 'dark'] as const) {
    test(`clearing the preview canvas preserves native ${colorScheme} contrast`, async ({
        page,
    }) => {
        await page.emulateMedia({ colorScheme })
        const query = new URLSearchParams({
            id: `${storyId}--default`,
            viewMode: 'story',
            globals: 'backgrounds.value:!undefined',
        })
        await page.goto(`/iframe.html?${query}`)
        const stage = page.getByTestId('fantasy-border-story')
        const body = page.locator('body')
        await expect(stage).toBeVisible()
        await expect(body).toHaveCSS(
            'background-color',
            await resolvedColor(page, 'var(--color-background)')
        )
        await expect(stage).toHaveCSS(
            'color',
            await body.evaluate((element) => getComputedStyle(element).color)
        )
        await expect(stage).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
        await expect(stage).toHaveCSS('background-image', 'none')
        const host = page.locator('#storybook-root > div').filter({ has: stage })
        await expect(host).toHaveCount(1)
        await expect(host).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
        await expect(host).toHaveCSS('background-image', 'none')
    })
}
