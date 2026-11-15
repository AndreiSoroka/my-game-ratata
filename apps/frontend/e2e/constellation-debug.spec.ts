import { expect, type Locator, type Page, test } from '@playwright/test'

import { assertBuildWorkflow, buildMetric } from './atlas-build-workflow'

const pathSizes = {
    blade: 10,
    magic: 14,
    prayer: 20,
    arrow: 10,
    life: 10,
    shadow: 9,
    prayer_road: 1,
    prayer_lantern: 1,
    prayer_grave: 2,
}

for (const width of [1280, 390, 320]) {
    test(`debug atlas exposes the full catalogue and stable personal sky at ${width}px`, async ({
        page,
    }) => {
        test.setTimeout(60_000)
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/?debug=constellations&class=cleric&seed=e2e-atlas-stable')
        const viewer = page.getByTestId('constellation-debug')
        const graph = page.getByRole('group', { name: 'Созвездия развития' })
        const list = page.getByTestId('debug-star-list')
        await expect(viewer).toBeVisible()
        await expect(list.locator('[data-star-id]')).toHaveCount(77)
        await expect(graph.locator('[data-node-id]')).toHaveCount(77)
        await expect
            .poll(async () => {
                const panel = await page.locator('.debug-selected-details').boundingBox()
                const lastEffect = await page
                    .getByTestId('selected-star-card')
                    .locator('li')
                    .last()
                    .boundingBox()
                return (
                    panel !== null &&
                    lastEffect !== null &&
                    lastEffect.y + lastEffect.height <= panel.y + panel.height + 1
                )
            })
            .toBe(true)
        await assertCenter(page, 'prayer')
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            width
        )
        await page.screenshot({
            path: test.info().outputPath(`debug-atlas-overview-${width}.png`),
            fullPage: true,
        })
        await assertBuildWorkflow(page, width, test.info())
        const initial = await coordinates(graph)
        await page.reload()
        await expect(graph.locator('[data-node-id]')).toHaveCount(77)
        expect(await coordinates(graph)).toEqual(initial)

        await page.getByTestId('debug-seed').fill('e2e-atlas-changed')
        await page.getByTestId('debug-apply').click()
        await expect.poll(() => coordinates(graph)).not.toEqual(initial)
        const changed = await coordinates(graph)
        await page.getByTestId('debug-regenerate').click()
        await expect(page.getByTestId('debug-seed')).not.toHaveValue('e2e-atlas-changed')
        await expect.poll(() => coordinates(graph)).not.toEqual(changed)

        for (const [heroClass, center] of [
            ['vanguard', 'blade'],
            ['arcanist', 'magic'],
            ['ranger', 'arrow'],
            ['cleric', 'prayer'],
        ] as const) {
            await page.getByTestId('debug-class').selectOption(heroClass)
            await assertCenter(page, center)
        }
        for (const [path, count] of Object.entries(pathSizes)) {
            await page.getByTestId('debug-path').selectOption(path)
            await expect(list.locator('[data-star-id]')).toHaveCount(count)
        }
        await page.getByTestId('debug-path').selectOption('')
        await expect(list.locator('[data-star-id]')).toHaveCount(77)

        await page.getByTestId('debug-search').fill('prayer.revive')
        await expect(list.locator('[data-star-id]')).toHaveCount(1)
        await list.locator('[data-star-id="prayer.revive"]').click()
        const card = page.getByTestId('selected-star-card')
        await expect(card.getByRole('heading', { name: 'Воскрешение', exact: true })).toBeVisible()
        await expect(card).toContainText('Пассивный навык')
        await expect(card.getByText('Условия открытия', { exact: true })).toHaveCount(0)
        await expect(card.getByText('Шанс срабатывания эффекта', { exact: true })).toHaveCount(0)
        await expect(page.getByTestId('debug-unlock-conditions')).toContainText(/Молитв/)
        await expect(page.getByTestId('debug-unlock-conditions')).toContainText(/кл[еи]рик/i)
        await expect(page.getByTestId('debug-unlock-conditions')).toContainText(/5|пят/i)
        await expect(page.getByTestId('debug-unlock-conditions')).toContainText(/Чудес/i)
        await assertFocused(page, 'prayer.revive')
        await page.screenshot({
            path: test.info().outputPath(`debug-atlas-revive-${width}.png`),
            fullPage: true,
        })

        await page.getByTestId('debug-search').fill('prayer.last_light')
        await list.locator('[data-star-id="prayer.last_light"]').click()
        await expect(
            card.getByRole('heading', { name: 'Последний огонёк', exact: true })
        ).toBeVisible()
        await expect(page.getByTestId('debug-unlock-conditions')).toContainText(/20\s*%/)
        await expect(page.getByTestId('debug-unlock-conditions')).toContainText(/враг|вражеск/i)
        await assertFocused(page, 'prayer.last_light')

        await page.getByTestId('debug-search').fill('prayer_grave.revive')
        await list.locator('[data-star-id="prayer_grave.revive"]').click()
        await expect(
            card.getByRole('heading', { name: 'Возвращение праха', exact: true })
        ).toBeVisible()
        await expect(card).toContainText('Пассивный навык')
        await expect(page.getByTestId('debug-unlock-conditions')).toContainText('Молитва праха')

        await page.getByTestId('debug-search').fill('prayer.gift1')
        await list.locator('[data-star-id="prayer.gift1"]').click()
        await expect(
            page
                .getByTestId('debug-chance-actions')
                .getByRole('heading', { name: 'Повышают шанс открытия', exact: true })
        ).toBeVisible()
        await expect(page.getByTestId('debug-chance-actions')).toContainText(
            /полезные дары здоровья/
        )
        await page.getByTestId('debug-build-all').click()
        await assertEffectExplanations(page, width)
        await assertPrayerCalculator(page, width)
        await assertEveryFormulaLegend(page, width)
        await page.getByTestId('debug-search').fill('')
        await expect(list.locator('[data-star-id]')).toHaveCount(77)
    })
}

test('debug atlas starts without player requests, sockets or a join flow', async ({ page }) => {
    const requests: string[] = [],
        sockets: string[] = []
    page.on('request', (request) => requests.push(request.url()))
    page.on('websocket', (socket) => sockets.push(socket.url()))
    await page.addInitScript(() => {
        const state = window as typeof window & {
            __atlasSockets?: Array<{ url: string; protocols: string[] }>
        }
        state.__atlasSockets = []
        const NativeSocket = window.WebSocket
        window.WebSocket = class extends NativeSocket {
            constructor(url: string | URL, protocols?: string | string[]) {
                state.__atlasSockets?.push({
                    url: String(url),
                    protocols: typeof protocols === 'string' ? [protocols] : (protocols ?? []),
                })
                super(url, protocols)
            }
        }
    })
    await page.goto('/?debug=constellations&class=cleric&seed=network-audit')
    await expect(page.getByTestId('constellation-debug')).toBeVisible()
    await expect(page.getByTestId('debug-star-list').locator('[data-star-id]')).toHaveCount(77)
    await page.getByTestId('debug-regenerate').click()
    await page.getByTestId('debug-class').selectOption('ranger')
    await assertCenter(page, 'arrow')
    await selectAtlasStar(page, 'prayer.root')
    await page.getByTestId('debug-prayer-faith').selectOption('10')
    await page.getByTestId('debug-prayer-mood').selectOption('benevolent')
    await expect(prayerMetric(page, 'Шанс ответа')).toHaveText('93,5%')
    const attempts = await page.evaluate(
        () =>
            (
                window as typeof window & {
                    __atlasSockets?: Array<{ url: string; protocols: string[] }>
                }
            ).__atlasSockets ?? []
    )
    // A dev-server run may have Vite's own HMR transport; the production-preview audit has none.
    const infrastructure = new Set(
        attempts
            .filter((attempt) => attempt.protocols.includes('vite-hmr'))
            .map((attempt) => new URL(attempt.url, page.url()).href)
    )
    expect(attempts.filter((attempt) => !attempt.protocols.includes('vite-hmr'))).toEqual([])
    expect(sockets.filter((url) => !infrastructure.has(url))).toEqual([])
    const developmentServer = requests.some((url) => new URL(url).pathname === '/@vite/client')
    expect(developmentServer || sockets.length === 0).toBe(true)
    expect(developmentServer || attempts.length === 0).toBe(true)
    expect(
        requests.filter((url) =>
            /\/(api|ws|agent|player|snapshot)(?:\/|$)|\/game\/map\/.*\.json$/.test(
                new URL(url).pathname
            )
        )
    ).toEqual([])
    await expect(page.getByLabel('Nickname', { exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => Boolean(window.__ratataTest))).toBe(false)
})

test('ordinary test entry still shows the normal sign-in page', async ({ page }) => {
    await page.goto('/?test=1')
    await expect(page.getByLabel('Nickname', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enter', exact: true })).toBeVisible()
    await expect(page.getByTestId('constellation-debug')).toHaveCount(0)
})

async function coordinates(graph: Locator) {
    return graph.locator('[data-node-id]').evaluateAll((nodes) =>
        nodes
            .map((node) => ({
                id: node.getAttribute('data-node-id'),
                transform: node.getAttribute('transform'),
            }))
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    )
}
async function assertCenter(page: Page, path: string): Promise<void> {
    const root = page.locator(`[data-node-id="${path}.root"]`)
    await expect(root).toHaveAttribute('transform', 'translate(0,0)')
    await expect(root).toHaveClass(/selected/)
}
async function assertFocused(page: Page, id: string): Promise<void> {
    const graph = page.getByRole('group', { name: 'Созвездия развития' })
    await graph.scrollIntoViewIfNeeded()
    const node = graph.locator(`[data-node-id="${id}"]`)
    await expect(node).toHaveClass(/selected/)
    await expect(node).toHaveAttribute('aria-current', 'true')
    await expect
        .poll(async () => {
            const frame = await graph.boundingBox(),
                hit = await node.locator('.hit').boundingBox()
            return (
                frame !== null &&
                hit !== null &&
                hit.x >= frame.x - 1 &&
                hit.y >= frame.y - 1 &&
                hit.x + hit.width <= frame.x + frame.width + 1 &&
                hit.y + hit.height <= frame.y + frame.height + 1
            )
        })
        .toBe(true)
}

async function assertEffectExplanations(page: Page, width: number): Promise<void> {
    const chance = page.getByTestId('debug-effect-chance')
    for (const [id, pattern] of [
        ['prayer.revive', /95/],
        ['prayer.root', /55\s*%/],
        ['blade.critical', /min\s*\(\s*95/],
        ['blade.damage1', /100\s*%/],
        ['shadow.luck1', /17[,.]4\s*%/],
    ] as const) {
        await page.getByTestId('debug-search').fill(id)
        await page.getByTestId('debug-star-list').locator(`[data-star-id="${id}"]`).click()
        await expect(
            chance.getByRole('heading', { name: 'Шанс срабатывания эффекта', exact: true })
        ).toBeVisible()
        await expect(chance).toContainText(pattern)
        const formulas = chance.getByTestId('debug-effect-chance-formulas')
        expect(await formulas.locator('li').count()).toBeGreaterThan(0)
        expect(await formulas.evaluate((element) => element.closest('details') === null)).toBe(true)
        if (id === 'prayer.root') {
            await expect(prayerMetric(page, 'Шанс ответа')).toHaveText('55%')
            await expect(prayerMetric(page, 'Шаг очищения могилы')).toHaveText('20%')
        }
        if (id === 'shadow.luck1') {
            await expect(formulas).toContainText(/обнаружен/i)
            await expect(formulas).toContainText(/clamp\(10,\s*90/)
            await expect(formulas).toContainText(/clamp\(5,\s*90/)
            await expect(formulas).toContainText(/\(1\s*[−-]\s*D\s*\/\s*100\)\s*[×*]\s*U/)
            await formulas
                .locator('[data-testid="debug-effect-formula"]')
                .first()
                .scrollIntoViewIfNeeded()
            await page.screenshot({
                path: test.info().outputPath(`debug-atlas-effect-chance-${width}.png`),
                fullPage: true,
            })
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            width
        )
    }
}

function prayerMetric(page: Page, label: string): Locator {
    if (label === 'Шаг очищения могилы') return buildMetric(page, 'Шанс шага очищения')
    if (label === 'Кара (если изучена)') return buildMetric(page, 'Шанс кары')
    return page.getByTestId('debug-prayer-metrics').locator(`[data-metric="${label}"] dd`)
}
async function selectAtlasStar(page: Page, id: string): Promise<void> {
    await page.getByTestId('debug-search').fill(id)
    await page.getByTestId('debug-star-list').locator(`[data-star-id="${id}"]`).click()
}
async function assertPrayerCalculator(page: Page, width: number): Promise<void> {
    await selectAtlasStar(page, 'prayer.root')
    const faith = page.getByTestId('debug-prayer-faith'),
        mood = page.getByTestId('debug-prayer-mood')
    const graph = page.getByRole('group', { name: 'Созвездия развития' })
    const original = {
        coordinates: await coordinates(graph),
        viewBox: await graph.getAttribute('viewBox'),
        url: page.url(),
    }
    const formulas = await page
        .getByTestId('debug-effect-chance-formulas')
        .locator('code')
        .allTextContents()
    await expect(faith).toHaveValue('1')
    await expect(mood).toHaveValue('neutral')
    await expect(prayerMetric(page, 'Шанс ответа')).toHaveText('55%')
    await faith.scrollIntoViewIfNeeded()
    await faith.selectOption('10')
    await expect(prayerMetric(page, 'Шанс ответа')).toHaveText('68,5%')
    await expect(prayerMetric(page, 'Отказ божества')).toHaveText('31,5%')
    await expect(prayerMetric(page, 'Шаг очищения могилы')).toHaveText('24,91%')
    await mood.scrollIntoViewIfNeeded()
    await mood.selectOption('benevolent')
    await expect(prayerMetric(page, 'Шанс ответа')).toHaveText('93,5%')
    await expect(prayerMetric(page, 'Шаг очищения могилы')).toHaveText('34%')
    await page
        .getByRole('heading', { name: 'Параметры примера', exact: true })
        .evaluate((element) => element.scrollIntoView({ block: 'start' }))
    await page.screenshot({
        path: test.info().outputPath(`debug-prayer-benevolent-${width}.png`),
        fullPage: true,
    })
    await mood.scrollIntoViewIfNeeded()
    await mood.selectOption('wrathful')
    await expect(prayerMetric(page, 'Шанс ответа')).toHaveText('38,5%')
    await expect(prayerMetric(page, 'Шаг очищения могилы')).toHaveText('14%')
    await expect(prayerMetric(page, 'Кара (если изучена)')).toHaveText('58,5%')
    expect(await coordinates(graph)).toEqual(original.coordinates)
    await expect(graph).toHaveAttribute('viewBox', original.viewBox!)
    expect(page.url()).toBe(original.url)
    await expect(page.getByTestId('debug-effect-chance-formulas').locator('code')).toHaveText(
        formulas
    )
    for (const [id, level, moodValue] of [
        ['prayer_road.root', '3', 'benevolent'],
        ['prayer_lantern.root', '4', 'wrathful'],
        ['prayer_grave.root', '7', 'neutral'],
    ] as const) {
        await selectAtlasStar(page, id)
        await expect(faith).toHaveValue('1')
        await expect(mood).toHaveValue('neutral')
        await faith.scrollIntoViewIfNeeded()
        await faith.selectOption(level)
        await mood.scrollIntoViewIfNeeded()
        await mood.selectOption(moodValue)
    }
    await selectAtlasStar(page, 'blade.critical')
    await expect(page.getByTestId('debug-prayer-calculator')).toHaveCount(0)
    for (const [id, level, moodValue] of [
        ['prayer.root', '10', 'wrathful'],
        ['prayer_road.root', '3', 'benevolent'],
        ['prayer_lantern.root', '4', 'wrathful'],
        ['prayer_grave.root', '7', 'neutral'],
    ] as const) {
        await selectAtlasStar(page, id)
        await expect(faith).toHaveValue(level)
        await expect(mood).toHaveValue(moodValue)
    }
    await selectAtlasStar(page, 'prayer.revive')
    await expect(faith).toHaveValue('10')
    await expect(prayerMetric(page, 'Шанс ответа')).toHaveText('38,5%')
    await expect(prayerMetric(page, 'Шаг очищения могилы')).toHaveCount(0)
    await page.getByTestId('debug-prayer-miracles').selectOption('7')
    await page.getByTestId('debug-last-light').check()
    await page.getByTestId('debug-class').selectOption('vanguard')
    await expect(page.getByTestId('debug-prayer-calculator')).toHaveCount(0)
    await page.getByTestId('debug-class').selectOption('cleric')
    await expect(prayerMetric(page, 'Шанс ответа')).toHaveText('38,5%')
    await page.getByTestId('debug-seed').fill('calculator-layout-only')
    await page.getByTestId('debug-apply').click()
    await expect(prayerMetric(page, 'Шанс ответа')).toHaveText('38,5%')
    await expect(page.getByTestId('debug-prayer-miracles')).toHaveValue('7')
    await expect(page.getByTestId('debug-last-light')).toBeChecked()
    await page.getByTestId('debug-prayer-calculator').scrollIntoViewIfNeeded()
    await page.screenshot({
        path: test.info().outputPath(`debug-prayer-calculator-${width}.png`),
        fullPage: true,
    })
}
async function assertEveryFormulaLegend(page: Page, width: number): Promise<void> {
    if (width !== 1280) return
    const ids = await page
        .getByRole('group', { name: 'Созвездия развития' })
        .locator('[data-node-id]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-node-id')!))
    expect(ids).toHaveLength(77)
    for (const id of ids) {
        await selectAtlasStar(page, id)
        const formulas = page
            .getByTestId('debug-effect-chance-formulas')
            .getByTestId('debug-effect-formula')
        expect(await formulas.count()).toBeGreaterThan(0)
        for (const formula of await formulas.all()) {
            await expect(formula.locator('h3')).not.toHaveText('')
            await expect(formula.locator('code')).not.toHaveText('')
            await expect(formula.locator('code')).not.toHaveText(/[А-Яа-яЁё]/)
            expect(await formula.evaluate((element) => element.closest('details') === null)).toBe(
                true
            )
            const terms = await formula.locator('dt').allTextContents(),
                definitions = await formula.locator('dd').allTextContents()
            expect(definitions).toHaveLength(terms.length)
            expect([...terms, ...definitions].every((entry) => entry.trim().length > 0)).toBe(true)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            1280
        )
    }
}
