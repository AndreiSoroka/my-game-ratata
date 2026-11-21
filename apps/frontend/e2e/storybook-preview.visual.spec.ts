import { createRequire } from 'node:module'

import { expect, type Page, test } from '@playwright/test'

import { lightUiColors } from '../src/shared/ui/theme/index'

const require = createRequire(import.meta.url)
const addonRequire = createRequire(require.resolve('@storybook/addon-a11y/package.json'))
const axeScript = addonRequire.resolve('axe-core/axe.min.js')
const stories = [
    {
        name: 'FantasyBorder',
        id: 'shared-external-fantasy-ui-borders-fantasyborder',
        testId: 'fantasy-border-story',
        defaultTestId: 'border-default',
        sections: ['default', 'variants', 'colors', 'composition', 'sizes'],
    },
    {
        name: 'FantasyDivider',
        id: 'shared-external-fantasy-ui-borders-fantasydivider',
        testId: 'fantasy-divider-story',
        defaultTestId: 'divider-default',
        sections: ['default', 'variants', 'directions', 'colors', 'sizes'],
    },
    {
        name: 'FantasyPanel',
        id: 'shared-external-fantasy-ui-borders-fantasypanel',
        testId: 'fantasy-panel-story',
        defaultTestId: 'panel-default',
        sections: ['default', 'variants', 'appearances', 'colors', 'composition', 'sizes'],
    },
] as const

interface StoryIndexEntry {
    title: string
    importPath: string
    type: 'story' | 'docs'
    name: string
}

test('Entities and Shared component groups list their Default first', async ({ request }) => {
    const response = await request.get('/index.json')
    expect(response.ok()).toBe(true)
    const { entries } = (await response.json()) as { entries: Record<string, StoryIndexEntry> }
    const componentStories = Object.values(entries).filter(
        ({ type, title }) => type === 'story' && /^(Entities|Shared)\//.test(title)
    )
    const defaults = new Map(componentStories.toReversed().map(({ title, name }) => [title, name]))
    for (const entry of componentStories) {
        const component = entry.importPath.split('/').at(-1)?.split('.stories.')[0]
        expect(entry.title.split('/').at(-1), entry.title).toBe(component)
        const [layer] = entry.title.split('/')
        expect(entry.importPath).toContain(`/src/${layer?.toLowerCase()}/`)
    }
    for (const entry of componentStories.filter(({ title }) => title.startsWith('Entities/'))) {
        const [, slice] = entry.title.split('/')
        expect(entry.title.split('/'), entry.title).toHaveLength(3)
        expect(entry.importPath).toContain(`/src/entities/${slice}/`)
    }
    expect(defaults.size).toBeGreaterThan(0)
    for (const [title, firstStory] of defaults) {
        expect(firstStory, title).toBe('Default')
    }
})

test('HudRow Default Controls change slots independently', async ({ page }) => {
    await page.goto('/?path=/story/shared-common-hudrow--default')
    const preview = page.frameLocator('#storybook-preview-iframe')
    const row = preview.locator('#storybook-root > div > .hud-row')
    await expect(row).toBeVisible()
    await expect(row.getByRole('img', { name: 'Иконка' })).toBeVisible()
    const content = row.locator('.hud-row__content')
    await expect(content.locator('div:empty')).toBeVisible()
    await page.getByRole('tab', { name: /^Controls/ }).click()
    await page.locator('#control-leading').selectOption({ label: 'Текст' })
    await expect(row.locator('.hud-row__leading')).toHaveText('HP')
    await expect(content.locator('div:empty')).toBeVisible()
    await page.locator('#control-content').selectOption({ label: 'Полоса ресурса' })
    await expect(content.getByRole('progressbar', { name: 'Ресурс' })).toBeVisible()
    await expect(row.getByRole('img', { name: 'Иконка' })).toBeVisible()
    await page.locator('#control-trailing').selectOption({ label: 'Без слота' })
    await expect(row.locator('.hud-row__trailing')).toHaveCount(0)
    await expect(row.locator('.hud-row__leading')).toHaveText('HP')
})

test('PlayerEffectsView Default Controls preview the identity slot', async ({ page }) => {
    await page.goto('/?path=/story/entities-player-effects-playereffectsview--default')
    const preview = page.frameLocator('#storybook-preview-iframe')
    const effects = preview.locator('#storybook-root > div > .player-effects')
    await expect(effects).toBeVisible()
    await expect(effects.locator('div.player-effects__identity:empty')).toHaveCount(1)
    await page.getByRole('tab', { name: /^Controls/ }).click()
    await page.locator('#control-identity').selectOption('soul-badge')
    await expect(effects.getByRole('img', { name: 'Искра' })).toBeVisible()
    await expect(effects.locator('div.player-effects__identity:empty')).toHaveCount(0)
    await page.locator('#control-identity').selectOption('none')
    await expect(effects.locator('.player-effects__identity')).toHaveCount(0)
})

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
        await expect(
            page.locator(`#storybook-root > div > [data-testid="${story.defaultTestId}"]`)
        ).toBeVisible()
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
                const content = page.getByTestId(
                    section === 'default' ? story.defaultTestId : story.testId
                )
                await expect(content).toBeVisible()
                const background = await resolvedColor(page, reference)
                expect(background).not.toBe('rgba(0, 0, 0, 0)')
                await expect(page.locator('body')).toHaveCSS('background-color', background)
                await expect(content).toHaveCSS('color', await resolvedColor(page, foreground))
                const host = page.locator('#storybook-root > div').filter({ has: content })
                await expect(host).toHaveCount(1)
                for (const surface of await host.or(page.getByTestId(story.testId)).all()) {
                    await expect(surface).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
                    await expect(surface).toHaveCSS('background-image', 'none')
                }
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
            const component = page.getByTestId(story.defaultTestId)
            const body = page.locator('body')
            await expect(component).toBeVisible()
            await expect(body).toHaveCSS(
                'background-color',
                await resolvedColor(page, 'var(--color-background)')
            )
            await expect(component).toHaveCSS(
                'color',
                await body.evaluate((element) => getComputedStyle(element).color)
            )
            const host = page.locator('#storybook-root > div').filter({ has: component })
            await expect(host).toHaveCount(1)
            await expect(host).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
            await expect(host).toHaveCSS('background-image', 'none')
        })
    }
}

test('FantasyDivider Default Controls update the rendered divider', async ({ page }) => {
    await page.goto('/?path=/story/shared-external-fantasy-ui-borders-fantasydivider--default')
    const preview = page.frameLocator('#storybook-preview-iframe')
    const divider = preview.getByTestId('divider-default')
    await expect(divider).toBeVisible()
    const controls = page.getByRole('tab', { name: /^Controls/ })
    await expect(controls).toBeVisible()
    await controls.click()
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
    await page.goto('/?path=/story/shared-external-fantasy-ui-borders-fantasyborder--default')
    const preview = page.frameLocator('#storybook-preview-iframe')
    const border = preview.getByTestId('border-default')
    await expect(border).toBeVisible()
    const controls = page.getByRole('tab', { name: /^Controls/ })
    await expect(controls).toBeVisible()
    await controls.click()
    await expect(page.locator('#control-border')).toHaveValue('border-026')
    await page.locator('#control-border').selectOption('border-025')
    await expect(border).toHaveAttribute('data-fantasy-border', 'border-025')
})

test('FantasyPanel Controls edit both colors independently', async ({ page }) => {
    await page.goto('/?path=/story/shared-external-fantasy-ui-borders-fantasypanel--default')
    const preview = page.frameLocator('#storybook-preview-iframe')
    const panel = preview.getByTestId('panel-default')
    await expect(panel).toBeVisible()
    const controls = page.getByRole('tab', { name: /^Controls/ })
    await expect(controls).toBeVisible()
    await controls.click()
    await expect(page.locator('#control-panel')).toHaveValue('panel-026')
    await expect(page.locator('#control-panel option[value^="panel-"]')).toHaveCount(32)
    await expect(page.locator('#control-appearance')).toHaveValue('solid')
    await expect(page.locator('#control-appearance option')).toHaveText([
        'Choose option...',
        'solid',
        'transparent-border',
        'transparent-center',
    ])
    const borderColor = page.locator('#control-borderColor')
    const backgroundColor = page.locator('#control-backgroundColor')
    await expect(borderColor).toHaveValue(lightUiColors.panel.parchment)
    await expect(backgroundColor).toHaveValue(lightUiColors.panel.parchment)
    await page.locator('#control-panel').selectOption('panel-025')
    await expect(panel).toHaveAttribute('data-fantasy-panel', 'panel-025')
    await page.locator('#control-appearance').selectOption('transparent-center')
    await expect(panel).toHaveAttribute('data-fantasy-panel-appearance', 'transparent-center')
    const initialBackground = await panel.evaluate(
        (element) => getComputedStyle(element).backgroundColor
    )
    await borderColor.fill(lightUiColors.border.gold)
    await borderColor.press('Tab')
    const borderFlood = panel.locator('feFlood[result="panel-border-color"]')
    const expectedBorder = await panel.evaluate((element, reference) => {
        const probe = element.ownerDocument.createElement('span')
        probe.hidden = true
        probe.style.color = reference
        element.append(probe)
        const color = getComputedStyle(probe).color
        probe.remove()
        return color
    }, lightUiColors.border.gold)
    await expect(borderFlood).toHaveCSS('flood-color', expectedBorder)
    await expect(panel).toHaveCSS('background-color', initialBackground)

    await backgroundColor.fill(lightUiColors.panel.coffee)
    await backgroundColor.press('Tab')
    await expect(panel).not.toHaveCSS('background-color', initialBackground)
    await expect(borderFlood).toHaveCSS('flood-color', expectedBorder)
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
