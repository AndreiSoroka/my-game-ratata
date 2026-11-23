import type { Vector2 } from '@my-game-ratata/contracts'
import { expect, type Locator, type Page, test } from '@playwright/test'

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

const layerRoots = ['blade', 'magic', 'prayer', 'arrow', 'life']
const skyPan = { x: 100, y: 30 }

test('five depths move stars at different speeds and keep lines and labels attached', async ({
    page,
}) => {
    await page.goto(
        '/iframe.html?id=entities-constellations-constellationgraph--five-depths&viewMode=story'
    )
    const graph = page.getByRole('group', { name: 'Созвездия развития' })
    const zoomIn = page.getByRole('button', { name: 'Приблизить небосвод' })
    const reset = page.getByRole('button', { name: 'Показать весь небосвод' })
    const background = graph.locator('.constellation-background__layer')
    await expect(graph.locator('.constellation-label').filter({ hasText: 'Молитва' })).toBeVisible()
    await expect(background).toHaveCount(5)
    const initialBackgroundTransform = (await background.first().getAttribute('patternTransform'))!
    const before = await skyProjection(graph)

    await panSky(page, graph)
    const panned = await skyProjection(graph)
    for (const [layer, id] of layerRoots.entries()) {
        const rate = 1 - 0.05 * layer
        expectMovement(before.stars[id]!.screen, panned.stars[id]!.screen, {
            x: skyPan.x * rate,
            y: skyPan.y * rate,
        })
    }
    expectMovement(before.stars.devotion!.screen, panned.stars.devotion!.screen, skyPan)
    expectLabelAttached(before, panned)
    expectAttachedLinks(panned)
    expect(panned.inner[1]!.world).not.toEqual(before.inner[1]!.world)
    expect(panned.cross[1]).not.toEqual(before.cross[1])
    await reset.click()
    expect(await skyProjection(graph)).toEqual(before)

    await zoomIn.click()
    const zoomed = await skyProjection(graph)
    expect(zoomed.stars.blade!.world).toEqual(before.stars.blade!.world)
    expect(zoomed.stars.life!.world).not.toEqual(before.stars.life!.world)
    const zoomMovement = displacement(before.stars.prayer!.world, zoomed.stars.prayer!.world)
    expectMovement(before.stars.devotion!.world, zoomed.stars.devotion!.world, zoomMovement)
    for (const [index, point] of before.inner.entries())
        expectMovement(point.world, zoomed.inner[index]!.world, zoomMovement)
    expectAttachedLinks(zoomed)
    const scales = await background.evaluateAll((layers) =>
        layers.map(
            (layer) => (layer as SVGPatternElement).patternTransform.baseVal.getItem(0).matrix.a
        )
    )
    expect(scales[0]).toBeGreaterThan(1)
    expect(scales.at(-1)).toBeGreaterThan(scales[0]!)
    await panSky(page, graph)
    const zoomPanned = await skyProjection(graph)
    expectLabelAttached(zoomed, zoomPanned)
    expectAttachedLinks(zoomPanned)

    await graph.getByRole('button', { name: 'Молитва', exact: true }).press('Enter')
    const focused = await skyProjection(graph)
    expect(focused.cross).toEqual(before.cross)
    expect(focused.stars.prayer!.world).toEqual(before.stars.prayer!.world)
    await reset.click()
    await expect(background.first()).toHaveAttribute('patternTransform', initialBackgroundTransform)
    expect(await skyProjection(graph)).toEqual(before)
})

type SkyProjection = Awaited<ReturnType<typeof skyProjection>>

async function panSky(page: Page, graph: Locator): Promise<void> {
    const bounds = (await graph.boundingBox())!
    const x = bounds.x + 30
    const y = bounds.y + bounds.height - 50
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + skyPan.x, y + skyPan.y, { steps: 5 })
    await page.mouse.up()
}

function displacement(before: Vector2, after: Vector2): Vector2 {
    return { x: after.x - before.x, y: after.y - before.y }
}

function expectMovement(before: Vector2, after: Vector2, expected: Vector2): void {
    const movement = displacement(before, after)
    expect(movement.x).toBeCloseTo(expected.x, 1)
    expect(movement.y).toBeCloseTo(expected.y, 1)
}

function expectLabelAttached(before: SkyProjection, after: SkyProjection): void {
    const movement = displacement(before.stars.prayer!.screen, after.stars.prayer!.screen)
    expectMovement(before.label, after.label, movement)
}

function expectAttachedLinks(projection: SkyProjection) {
    for (const [end, node] of [
        [projection.inner[0]?.world, 'prayer'],
        [projection.inner.at(-1)?.world, 'devotion'],
        [projection.cross[0], 'devotion'],
        [projection.cross.at(-1), 'life'],
    ] as const) {
        expect(end!.x).toBeCloseTo(projection.stars[node]!.world.x, 4)
        expect(end!.y).toBeCloseTo(projection.stars[node]!.world.y, 4)
    }
}

function skyProjection(graph: Locator) {
    return graph.evaluate(
        (element, ids) => {
            const stars: Record<string, { screen: Vector2; world: Vector2 }> = {}
            for (const id of ids) {
                const node = element.querySelector<SVGGElement>(`[data-node-id="${id}"]`)!
                const { e: x, f: y } = node.transform.baseVal.getItem(0).matrix
                const { e, f } = node.getScreenCTM()!
                stars[id] = { screen: { x: e, y: f }, world: { x, y } }
            }
            const inner = element.querySelector<SVGPolylineElement>(
                'polyline:not(.constellation-edge--cross-link)'
            )!
            const matrix = inner.getScreenCTM()!
            const cross = element.querySelector<SVGPolylineElement>(
                '.constellation-edge--cross-link'
            )!.points
            const label = [...element.querySelectorAll('.constellation-label')].find(
                (node) => node.textContent?.trim() === 'Молитва'
            )!
            const { x, y } = label.getBoundingClientRect()
            return {
                stars,
                inner: Array.from(inner.points, ({ x, y }) => {
                    const screen = new DOMPoint(x, y).matrixTransform(matrix)
                    return { world: { x, y }, screen: { x: screen.x, y: screen.y } }
                }),
                cross: Array.from(cross, ({ x, y }) => ({ x, y })),
                label: { x, y },
            }
        },
        [...layerRoots, 'devotion']
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
