import { expect, type Locator, test } from '@playwright/test'

import { fullConstellationCatalog } from '../../backend/src/game/constellationNodes'

const rootCount = fullConstellationCatalog.filter((node) => node.parents.length === 0).length

for (const width of [320, 390, 1280]) {
    test(`full catalogue remains readable and pannable at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(
            '/iframe.html?id=game-characterwindow--full-mother-development&viewMode=story'
        )
        const graph = page.getByRole('group', { name: 'Созвездия развития' })
        await expect(graph).toBeVisible()
        await expect(graph.locator('[role=button]')).toHaveCount(rootCount)
        await expect(graph.locator('.constellation-label').first()).toBeVisible()
        await page.screenshot({ path: info.outputPath(`constellation-overview-${width}.png`) })
        await graph.getByRole('button', { name: 'Молитва', exact: true }).locator('.hit').click()
        await expect
            .poll(() => graph.locator('[data-node-id]').count())
            .toBe(fullConstellationCatalog.length)
        const geometry = await graph.evaluate((element) => {
            const frame = element.getBoundingClientRect()
            const inside = (rect: DOMRect) =>
                rect.x >= frame.x &&
                rect.y >= frame.y &&
                rect.right <= frame.right &&
                rect.bottom <= frame.bottom
            const labels = [...element.querySelectorAll('.constellation-label')].map((node) =>
                node.getBoundingClientRect()
            )
            const overlappingLabels = labels
                .filter(inside)
                .some((a, index, visible) =>
                    visible
                        .slice(index + 1)
                        .some(
                            (b) =>
                                a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y
                        )
                )
            return { overlappingLabels }
        })
        expect(geometry.overlappingLabels).toBe(false)
        const targets = await hitGeometry(graph)
        expect(targets.count).toBeGreaterThan(0)
        expect(targets.maximumDiameter).toBeLessThanOrEqual(44.01)
        expect(targets.minimumGap).toBeGreaterThanOrEqual(-0.01)
        const before = await graph.getAttribute('viewBox')
        const bounds = await graph.boundingBox()
        const x = bounds!.x + bounds!.width / 2,
            y = bounds!.y + bounds!.height - 12
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x - 35, y - 20, { steps: 5 })
        await page.mouse.up()
        await expect(graph).not.toHaveAttribute('viewBox', before!)
        await page.screenshot({ path: info.outputPath(`constellation-detail-${width}.png`) })
    })
}

const graphStory =
    '/iframe.html?id=entities-constellations-constellationgraph--default&viewMode=story'

test('closed roots appear first and level-gated stars appear last', async ({ page }) => {
    await page.goto(graphStory)
    const graph = page.getByRole('group', { name: 'Созвездия развития' })
    const root = graph.locator('[data-node-id="arrow"]')
    const star = graph.locator('[data-node-id="guard"]')
    const levelGated = graph.locator('[data-node-id="finesse"]')
    const ordinaryLink = graph.locator('polyline').nth(1)
    const levelLink = graph.locator('polyline').last()
    const zoomIn = page.getByRole('button', { name: 'Приблизить небосвод' })
    const reset = page.getByRole('button', { name: 'Показать весь небосвод' })
    const hiddenAtOverview = [root, star, levelGated, ordinaryLink, levelLink]
    for (const element of hiddenAtOverview) await expect(element).toHaveCSS('opacity', '0')

    await graph.hover()
    await page.mouse.wheel(0, -100)
    await expect.poll(() => opacity(root)).toBeGreaterThan(0)
    await expect(star).toHaveCSS('opacity', '0')
    await expect(ordinaryLink).toHaveCSS('opacity', '0')
    await reset.click()

    await zoomIn.click()
    await expect.poll(() => opacity(star)).toBeGreaterThan(0)
    const distantStarOpacity = await opacity(star)
    expect(distantStarOpacity).toBeLessThan(await opacity(root))
    expect(await opacity(ordinaryLink)).toBeCloseTo(distantStarOpacity * 0.4, 4)
    await expect(levelGated).toHaveCSS('opacity', '0')
    await expect(levelLink).toHaveCSS('opacity', '0')
    for (let step = 0; step < 3; step++) await zoomIn.click()
    expect(await opacity(star)).toBeGreaterThan(distantStarOpacity)
    await expect(levelGated).toHaveCSS('opacity', '0')
    await expect(levelLink).toHaveCSS('opacity', '0')

    for (let step = 0; step < 3; step++) await zoomIn.click()
    await expect(root).toHaveCSS('opacity', '0.5')
    await expect(star).toHaveCSS('opacity', '0.5')
    await expect(ordinaryLink).toHaveCSS('opacity', '0.2')
    expect(await opacity(levelGated)).toBeGreaterThan(0)
    expect(await opacity(levelGated)).toBeLessThan(0.5)
    for (let step = 0; step < 2; step++) await zoomIn.click()
    await expect(levelGated).toHaveCSS('opacity', '0.5')
    await expect(levelLink).toHaveCSS('opacity', '0.2')
    await expect(
        graph.locator('.constellation-label').filter({ hasText: 'Неизвестно' })
    ).toHaveCount(0)
    await reset.click()
    for (const element of hiddenAtOverview) await expect(element).toHaveCSS('opacity', '0')
})

function opacity(locator: Locator) {
    return locator.evaluate(async (node) => {
        await Promise.all(
            node.getAnimations().map(({ finished }) => finished.catch(() => undefined))
        )
        return Number(getComputedStyle(node).opacity)
    })
}

const layerStars = ['grave', 'strike', 'parry', 'arrow', 'blade']

test('five foreground depths move independently on pan and zoom and keep lines attached', async ({
    page,
}) => {
    await page.goto(graphStory)
    const graph = page.getByRole('group', { name: 'Созвездия развития' })
    const zoomIn = page.getByRole('button', { name: 'Приблизить небосвод' })
    const reset = page.getByRole('button', { name: 'Показать весь небосвод' })
    const background = graph.locator('.constellation-background__layer')
    await expect(background).toHaveCount(5)
    const initialBackgroundTransform = (await background.first().getAttribute('patternTransform'))!
    const before = await skyProjection(graph)

    await zoomIn.click()
    const zoomed = await skyProjection(graph)
    expect(zoomed.stars.grave!.world).toEqual(before.stars.grave!.world)
    expect(zoomed.stars.blade!.world).not.toEqual(before.stars.blade!.world)
    expectAttachedLink(zoomed)
    const scales = await background.evaluateAll((layers) =>
        layers.map(
            (layer) => (layer as SVGPatternElement).patternTransform.baseVal.getItem(0).matrix.a
        )
    )
    expect(scales[0]).toBeGreaterThan(1)
    expect(scales.at(-1)).toBeGreaterThan(scales[0]!)
    await reset.click()
    await expect(background.first()).toHaveAttribute('patternTransform', initialBackgroundTransform)
    expect(await skyProjection(graph)).toEqual(before)

    const bounds = (await graph.boundingBox())!
    await page.mouse.move(bounds.x + 30, bounds.y + bounds.height - 20)
    await page.mouse.down()
    await page.mouse.move(bounds.x + 130, bounds.y + bounds.height - 20, { steps: 5 })
    await page.mouse.up()
    const after = await skyProjection(graph)
    for (const [layer, id] of layerStars.entries()) {
        expect(after.stars[id]!.screen - before.stars[id]!.screen).toBeCloseTo(100 - 1.5 * layer, 1)
    }
    expectAttachedLink(after)
    expect(after.link[1]).not.toEqual(before.link[1])

    await graph.getByRole('button', { name: 'Клинок', exact: true }).press('Enter')
    const focused = await skyProjection(graph)
    expect(focused.link).toEqual(before.link)
    expect(focused.stars.blade!.world).toEqual(before.stars.blade!.world)
    await reset.click()
    expect(await skyProjection(graph)).toEqual(before)
})

function expectAttachedLink(projection: Awaited<ReturnType<typeof skyProjection>>) {
    for (const [end, node] of [
        [projection.link[0], 'slash'],
        [projection.link.at(-1), 'grave'],
    ] as const) {
        expect(end!.x).toBeCloseTo(projection.stars[node]!.world.x, 4)
        expect(end!.y).toBeCloseTo(projection.stars[node]!.world.y, 4)
    }
}

function skyProjection(graph: Locator) {
    return graph.evaluate(
        (element, ids) => {
            const stars: Record<string, { screen: number; world: { x: number; y: number } }> = {}
            for (const id of ids) {
                const node = element.querySelector<SVGGElement>(`[data-node-id="${id}"]`)!
                const { e: x, f: y } = node.transform.baseVal.getItem(0).matrix
                stars[id] = { screen: node.getScreenCTM()!.e, world: { x, y } }
            }
            const points = element.querySelector<SVGPolylineElement>(
                '.constellation-edge--cross-link'
            )!.points
            return {
                stars,
                link: Array.from(points, ({ x, y }) => ({ x, y })),
            }
        },
        [...layerStars, 'slash']
    )
}

for (const width of [390, 1280]) {
    test(`known stars can be clicked before detailed labels appear at ${width}px`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(graphStory)
        const graph = page.getByRole('group', { name: 'Созвездия развития' })
        const slash = graph.getByRole('button', { name: 'Удар', exact: true })
        const parry = graph.getByRole('button', { name: 'Парирование', exact: true })
        await expect(graph.locator('[data-node-id="slash"]')).toBeAttached()
        await expect(slash).toHaveCount(0)
        await expect(parry).toHaveCount(0)
        await page.getByRole('button', { name: 'Приблизить небосвод' }).click()
        const slashHit = slash.locator('.hit')
        const parryHit = parry.locator('.hit')
        const a = (await slashHit.boundingBox())!
        const b = (await parryHit.boundingBox())!
        expect(a.width).toBeGreaterThan(0)
        expect(a.width).toBeLessThan(44)
        expect(b.width).toBeGreaterThan(0)
        expect(b.width).toBeLessThan(44)
        expect(a.x + a.width).toBeLessThan(b.x)
        await expect(
            graph.locator('.constellation-label').filter({ hasText: 'Парирование' })
        ).toHaveCount(0)
        await slashHit.click()
        await expect(slash).toBeFocused()
        await parryHit.click()
        await expect(parry).toBeFocused()
    })
}

function hitGeometry(graph: Locator) {
    return graph.evaluate((element) => {
        const frame = element.getBoundingClientRect()
        const hits = [...element.querySelectorAll('[role=button] .hit')]
            .map((node) => node.getBoundingClientRect())
            .filter(
                ({ left, right, top, bottom }) =>
                    left >= frame.left &&
                    right <= frame.right &&
                    top >= frame.top &&
                    bottom <= frame.bottom
            )
            .map(({ x, y, width, height }) => ({
                x: x + width / 2,
                y: y + height / 2,
                radius: width / 2,
            }))
        const gaps = hits.flatMap((a, index) =>
            hits.slice(index + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius)
        )
        return {
            count: hits.length,
            maximumDiameter: Math.max(...hits.map((hit) => hit.radius * 2)),
            minimumGap: Math.min(...gaps),
        }
    })
}

for (const width of [320, 390, 1280]) {
    test(`unknown player stars stay inert at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto('/iframe.html?id=game-characterwindow--development&viewMode=story')
        const graph = page.getByRole('group', { name: 'Созвездия развития' })
        await expect(graph).toBeVisible()
        const unknown = graph.locator('[data-node-id].closed').first()
        await expect(unknown).toHaveAttribute('aria-hidden', 'true')
        expect(await unknown.getAttribute('role')).toBeNull()
        expect(await unknown.getAttribute('tabindex')).toBeNull()
        expect(await unknown.evaluate((element) => getComputedStyle(element).cursor)).toBe(
            'default'
        )
        const card = page.getByLabel('Выбранная звезда')
        const before = await card.innerText()
        const camera = await graph.getAttribute('viewBox')
        const box = await unknown.boundingBox()
        await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
        await expect.poll(() => card.innerText()).toBe(before)
        await expect(graph).toHaveAttribute('viewBox', camera!)
        await graph.getByRole('button', { name: 'Молитва', exact: true }).locator('.hit').click()
        await expect(graph.locator('.closed[role="button"]')).toHaveCount(0)
        await expect(graph.locator('.closed[tabindex]')).toHaveCount(0)
        await expect(graph.locator('.closed.selected')).toHaveCount(0)
    })
}
