import { createRequire } from 'node:module'

import { expect, type Page, test } from '@playwright/test'

import { lightUiColors } from '../src/shared/ui/theme/index'

const require = createRequire(import.meta.url)
const addonRequire = createRequire(require.resolve('@storybook/addon-a11y/package.json'))
const axeScript = addonRequire.resolve('axe-core/axe.min.js')
const stories = [
    {
        name: 'FantasyBorder',
        id: 'interface-base-fantasy-ui-borders-fantasyborder',
        testId: 'fantasy-border-story',
        sections: ['default', 'variants', 'colors', 'composition', 'sizes'],
    },
    {
        name: 'FantasyDivider',
        id: 'interface-base-fantasy-ui-borders-fantasydivider',
        testId: 'fantasy-divider-story',
        sections: ['default', 'variants', 'directions', 'colors', 'sizes'],
    },
    {
        name: 'FantasyPanel',
        id: 'interface-base-fantasy-ui-borders-fantasypanel',
        testId: 'fantasy-panel-story',
        sections: ['default', 'variants', 'appearances', 'colors', 'composition', 'sizes'],
    },
] as const

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

for (const story of stories) {
    test(`${story.name} previews omit app DevTools and pass the real accessibility scan`, async ({
        page,
    }) => {
        await page.goto(`/iframe.html?id=${story.id}--default&viewMode=story`)
        await expect(page.getByTestId(story.testId)).toBeVisible()
        const background = await resolvedColor(page, lightUiColors.button.wood.bottom)
        await expect(page.locator('body')).toHaveCSS('background-color', background)
        await page.evaluate(() => document.fonts.ready)
        await expect(page.locator('#__vue-devtools-container__')).toHaveCount(0)
        await expect(page.locator('.vue-devtools__anchor-btn')).toHaveCount(0)
        const toolingRequests = await page.evaluate(() =>
            [
                ...Array.from(document.scripts, (script) => script.src),
                ...performance.getEntriesByType('resource').map((resource) => resource.name),
            ].filter(
                (src) => src.includes('vue-devtools-path') || src.includes('vue-inspector-path')
            )
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
        test(`${story.name} stories share one selectable ${preset} canvas`, async ({ page }) => {
            for (const section of story.sections) {
                const query = new URLSearchParams({
                    id: `${story.id}--${section}`,
                    viewMode: 'story',
                    globals: `backgrounds.value:${preset}`,
                })
                await page.goto(`/iframe.html?${query}`)
                const stage = page.getByTestId(story.testId)
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
        test(`${story.name} clearing the preview canvas preserves native ${colorScheme} contrast`, async ({
            page,
        }) => {
            await page.emulateMedia({ colorScheme })
            const query = new URLSearchParams({
                id: `${story.id}--default`,
                viewMode: 'story',
                globals: 'backgrounds.value:!undefined',
            })
            await page.goto(`/iframe.html?${query}`)
            const stage = page.getByTestId(story.testId)
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
}

test('FantasyDivider Default Controls update the rendered divider', async ({ page }) => {
    await page.goto('/?path=/story/interface-base-fantasy-ui-borders-fantasydivider--default')
    const preview = page.frameLocator('#storybook-preview-iframe')
    await expect(preview.getByTestId('fantasy-divider-story')).toBeVisible()
    const controls = page.getByRole('tab', { name: /^Controls/ })
    await expect(controls).toBeVisible()
    await controls.click()
    const divider = preview.getByTestId('divider-default')
    await expect(page.locator('#control-divider')).toHaveValue('divider-000')
    await page.locator('#control-divider').selectOption('divider-004')
    await expect(divider).toHaveAttribute('data-fantasy-divider', 'divider-004')
    await expect(page.locator('#control-ends')).toHaveValue('right')
    await page.locator('#control-ends').selectOption('both')
    await expect(divider).toHaveAttribute('data-fantasy-divider-ends', 'both')
    await expect(page.locator('#control-fade')).not.toBeChecked()
    await page.locator('label[for="control-fade"]').click()
    await expect(page.locator('#control-fade')).toBeChecked()
    await expect(divider).toHaveAttribute('data-fantasy-divider-fade', 'true')
    await page.locator('#control-color').fill(lightUiColors.border.gold)
    await page.locator('#control-color').press('Tab')
    await expect(divider.locator('feFlood')).toHaveAttribute('style', /--ui-light-border-gold/)
})

test('FantasyBorder Default Controls update the rendered border', async ({ page }) => {
    await page.goto('/?path=/story/interface-base-fantasy-ui-borders-fantasyborder--default')
    const preview = page.frameLocator('#storybook-preview-iframe')
    await expect(preview.getByTestId('fantasy-border-story')).toBeVisible()
    const controls = page.getByRole('tab', { name: /^Controls/ })
    await expect(controls).toBeVisible()
    await controls.click()
    await expect(page.locator('#control-border')).toHaveValue('border-026')
    await page.locator('#control-border').selectOption('border-025')
    await expect(preview.getByTestId('border-default')).toHaveAttribute(
        'data-fantasy-border',
        'border-025'
    )
})

test('FantasyPanel Default Controls update the rendered panel', async ({ page }) => {
    await page.goto('/?path=/story/interface-base-fantasy-ui-borders-fantasypanel--default')
    const preview = page.frameLocator('#storybook-preview-iframe')
    await expect(preview.getByTestId('fantasy-panel-story')).toBeVisible()
    const controls = page.getByRole('tab', { name: /^Controls/ })
    await expect(controls).toHaveAccessibleName(/^Controls\s*3$/)
    await controls.click()
    const panel = preview.getByTestId('panel-default')
    await expect(page.locator('#control-panel')).toHaveValue('panel-026')
    await expect(page.locator('#control-panel option[value^="panel-"]')).toHaveCount(32)
    await expect(page.locator('#control-appearance')).toHaveValue('solid')
    await expect(page.locator('#control-appearance option')).toHaveText([
        'Choose option...',
        'solid',
        'transparent-border',
        'transparent-center',
    ])
    await expect(page.locator('#control-color')).toHaveValue(lightUiColors.panel.parchment)
    await page.locator('#control-panel').selectOption('panel-025')
    await expect(panel).toHaveAttribute('data-fantasy-panel', 'panel-025')
    await page.locator('#control-appearance').selectOption('transparent-center')
    await expect(panel).toHaveAttribute('data-fantasy-panel-appearance', 'transparent-center')
    await page.locator('#control-color').fill(lightUiColors.border.gold)
    await page.locator('#control-color').press('Tab')
    await expect(panel.locator('feFlood')).toHaveAttribute('style', /--ui-light-border-gold/)
    const expectedColor = await panel.evaluate((element, reference) => {
        const probe = element.ownerDocument.createElement('span')
        probe.hidden = true
        probe.style.color = reference
        element.append(probe)
        const color = getComputedStyle(probe).color
        probe.remove()
        return color
    }, lightUiColors.border.gold)
    await expect(panel.locator('feFlood')).toHaveCSS('flood-color', expectedColor)
})

for (const story of stories) {
    test(`${story.name} catalogs omit ignored Controls`, async ({ page }) => {
        for (const section of story.sections.slice(1)) {
            await page.goto(`/?path=/story/${story.id}--${section}`)
            const preview = page.frameLocator('#storybook-preview-iframe')
            await expect(preview.getByTestId(story.testId)).toBeVisible()
            await expect(page.getByRole('tab', { name: /^Accessibility/ })).toBeVisible()
            await expect(page.getByRole('tab', { name: /^Controls/ })).toHaveCount(0)
            await expect(page.getByRole('table')).toHaveCount(0)
        }
    })
}
