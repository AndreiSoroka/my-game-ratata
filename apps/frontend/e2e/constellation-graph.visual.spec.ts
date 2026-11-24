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
const layerChildren = Array.from({ length: 5 }, (_, index) => `prayer.depth-${index}`)
const skyPan = { x: 100, y: 30 }
const layeredBounds = { x: -400, y: -250, width: 800, height: 500 }
const layeredStory =
    '/iframe.html?id=entities-constellations-constellationgraph--five-depths&viewMode=story'

for (const width of [390, 1280]) {
    test(`five perspective planes retain their shapes through repeated zoom and pan at ${width}px`, async ({
        page,
    }, info) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(layeredStory)
        const graph = page.getByRole('group', { name: 'Созвездия развития' })
        const zoomIn = page.getByRole('button', { name: 'Приблизить небосвод' })
        const zoomOut = page.getByRole('button', { name: 'Отдалить небосвод' })
        const reset = page.getByRole('button', { name: 'Показать весь небосвод' })
        const background = graph.locator('.constellation-background__layer')
        await expect(
            graph.locator('.constellation-label').filter({ hasText: 'Молитва' })
        ).toBeVisible()
        await expect(background).toHaveCount(5)
        const before = await skyProjection(graph)

        await panSky(page, graph)
        const overviewPanned = await skyProjection(graph)
        for (const id of Object.keys(before.stars))
            expect(overviewPanned.stars[id]!.world).toEqual(before.stars[id]!.world)
        expectLabelAttached(before, overviewPanned)
        await reset.click()
        for (let step = 0; step < 6; step++) await zoomIn.click()
        const near = await skyProjection(graph)
        await panSky(page, graph)
        const panned = await skyProjection(graph)
        expectMovement(near.stars.blade!.screen, panned.stars.blade!.screen, skyPan)
        for (const id of layerRoots.slice(1)) {
            const movement = displacement(near.stars[id]!.screen, panned.stars[id]!.screen)
            expect(movement.x).toBeGreaterThan(skyPan.x * 0.8)
            expect(movement.x).toBeLessThan(skyPan.x - 0.01)
        }
        const childOffsets = layerChildren.map((id) =>
            Math.round((panned.stars[id]!.world.x - near.stars[id]!.world.x) * 1000)
        )
        expect(new Set(childOffsets).size).toBe(5)
        expectPerspectiveProjection(before, panned)
        expectAttachedLinks(panned)

        for (let cycle = 0; cycle < 6; cycle++) {
            await zoomIn.click()
            await zoomIn.click()
            await panSky(page, graph, { x: 80, y: 25 })
            expectPerspectiveProjection(before, await skyProjection(graph))
            await zoomOut.click()
            await zoomOut.click()
            const projection = await skyProjection(graph)
            expectPerspectiveProjection(before, projection)
            expectAttachedLinks(projection)
        }
        await page.screenshot({ path: info.outputPath(`five-depths-repeated-${width}.png`) })
        await reset.click()
        expectSameProjection(await skyProjection(graph), before)
        for (let step = 0; step < 6; step++) await zoomIn.click()
        await panSky(page, graph)
        expectSameProjection(await skyProjection(graph), panned)

        await zoomIn.click()
        const scales = await background.evaluateAll((layers) =>
            layers.map(
                (layer) => (layer as SVGPatternElement).patternTransform.baseVal.getItem(0).matrix.a
            )
        )
        expect(scales[0]).toBeGreaterThan(1)
        expect(scales.at(-1)).toBeGreaterThan(scales[0]!)
        await panSky(page, graph, { x: 40, y: 20 })
        await panSky(page, graph, { x: -40, y: -20 })
        await zoomOut.click()
        expectSameProjection(await skyProjection(graph), panned)

        await reset.click()
        await graph.getByRole('button', { name: 'Молитва', exact: true }).press('Enter')
        const focused = await skyProjection(graph)
        expectPerspectiveProjection(before, focused)
        expectAttachedLinks(focused)
        expect(focused.stars.life!.world).not.toEqual(before.stars.life!.world)
        await graph.getByRole('button', { name: 'Молитва', exact: true }).press('Enter')
        expectSameProjection(await skyProjection(graph), focused)
        await page.screenshot({ path: info.outputPath(`five-depths-focused-${width}.png`) })
        await reset.click()
        expectSameProjection(await skyProjection(graph), before)
    })

    test(`camera stops at all map edges and reverses immediately at ${width}px`, async ({
        page,
    }, info) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(layeredStory)
        const graph = page.getByRole('group', { name: 'Созвездия развития' })
        await expect(graph).toBeVisible()
        const zoomIn = page.getByRole('button', { name: 'Приблизить небосвод' })
        const zoomOut = page.getByRole('button', { name: 'Отдалить небосвод' })
        const reset = page.getByRole('button', { name: 'Показать весь небосвод' })
        const before = await skyProjection(graph)
        for (const target of [
            { x: -400, y: 0 },
            { x: 400, y: 0 },
            { x: 0, y: -250 },
            { x: 0, y: 250 },
            { x: -400, y: -250 },
            { x: 400, y: -250 },
            { x: 400, y: 250 },
            { x: -400, y: 250 },
        ]) {
            await reset.click()
            for (let step = 0; step < 3; step++) await zoomIn.click()
            const frame = (await graph.boundingBox())!
            const start = { x: frame.x + 30, y: frame.y + frame.height - 50 }
            const direction = { x: -Math.sign(target.x), y: -Math.sign(target.y) }
            const end = { x: start.x + direction.x * 10_000, y: start.y + direction.y * 10_000 }
            await page.mouse.move(start.x, start.y)
            await page.mouse.down()
            await page.mouse.move(end.x, end.y, { steps: 3 })
            const stopped = await skyProjection(graph)
            expectCameraCenter(stopped, target)
            expectCameraWithinMap(stopped)
            expectPerspectiveProjection(before, stopped)
            await page.mouse.move(end.x + direction.x * 100, end.y + direction.y * 100)
            expectSameProjection(await skyProjection(graph), stopped)
            await page.mouse.move(end.x + direction.x * 90, end.y + direction.y * 90)
            const reversed = await skyProjection(graph)
            expectCameraCenter(reversed, {
                x: target.x + (direction.x * 10) / stopped.scale,
                y: target.y + (direction.y * 10) / stopped.scale,
            })
            expectCameraWithinMap(reversed)
            await page.mouse.up()
        }
        await page.setViewportSize({ width: width === 390 ? 1280 : 390, height: 740 })
        expectCameraWithinMap(await skyProjection(graph))
        for (let step = 0; step < 3; step++) await zoomOut.click()
        const resized = await skyProjection(graph)
        expectCameraWithinMap(resized)
        expectPerspectiveProjection(before, resized)
        await page.screenshot({ path: info.outputPath(`five-depths-boundary-${width}.png`) })
        await reset.click()
        expectCameraCenter(await skyProjection(graph), { x: 0, y: 0 })
    })
}

type SkyProjection = Awaited<ReturnType<typeof skyProjection>>

async function panSky(page: Page, graph: Locator, pan = skyPan): Promise<void> {
    const bounds = (await graph.boundingBox())!
    const x = bounds.x + 30
    const y = bounds.y + bounds.height - 50
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + pan.x, y + pan.y, { steps: 5 })
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
    expect(before.label).not.toBeNull()
    expect(after.label).not.toBeNull()
    const movement = displacement(before.stars.prayer!.screen, after.stars.prayer!.screen)
    expectMovement(before.label!, after.label!, movement)
}

function expectPerspectiveProjection(authored: SkyProjection, projection: SkyProjection): void {
    const center = {
        x: projection.camera.x + projection.camera.width / 2,
        y: projection.camera.y + projection.camera.height / 2,
    }
    for (const [id, star] of Object.entries(projection.stars)) {
        let layer = layerRoots.indexOf(id)
        if (layer < 0) {
            let hash = 0
            for (const symbol of id) hash = Math.imul(hash, 31) + symbol.charCodeAt(0)
            layer = (hash >>> 0) % 5
        }
        const factor = 1 / (1 + (layer / 4) * 0.25 * (1 - 1 / Math.max(1, projection.zoom)))
        const original = authored.stars[id]!.world
        expect(
            Math.hypot(
                star.world.x - center.x - (original.x - center.x) * factor,
                star.world.y - center.y - (original.y - center.y) * factor
            ) * projection.scale
        ).toBeLessThan(0.02)
    }
}

function expectSameProjection(actual: SkyProjection, expected: SkyProjection): void {
    for (const [id, star] of Object.entries(actual.stars)) {
        expect(star.world.x).toBeCloseTo(expected.stars[id]!.world.x, 4)
        expect(star.world.y).toBeCloseTo(expected.stars[id]!.world.y, 4)
    }
    for (const [index, point] of actual.cross.entries()) {
        expect(point.x).toBeCloseTo(expected.cross[index]!.x, 4)
        expect(point.y).toBeCloseTo(expected.cross[index]!.y, 4)
    }
    expect(actual.background).toHaveLength(expected.background.length)
    for (const [index, matrix] of actual.background.entries()) {
        for (const [coefficient, value] of matrix.entries())
            expect(value).toBeCloseTo(expected.background[index]![coefficient]!, 4)
    }
    expectCameraCenter(actual, {
        x: expected.camera.x + expected.camera.width / 2,
        y: expected.camera.y + expected.camera.height / 2,
    })
    expect(actual.camera.width).toBeCloseTo(expected.camera.width, 4)
    expect(actual.camera.height).toBeCloseTo(expected.camera.height, 4)
}

function expectCameraCenter(projection: SkyProjection, expected: Vector2): void {
    expect(projection.camera.x + projection.camera.width / 2).toBeCloseTo(expected.x, 4)
    expect(projection.camera.y + projection.camera.height / 2).toBeCloseTo(expected.y, 4)
}

function expectCameraWithinMap(projection: SkyProjection): void {
    const { x, y, width, height } = projection.camera
    const center = { x: x + width / 2, y: y + height / 2 }
    expect(center.x).toBeGreaterThanOrEqual(layeredBounds.x - 0.001)
    expect(center.x).toBeLessThanOrEqual(layeredBounds.x + layeredBounds.width + 0.001)
    expect(center.y).toBeGreaterThanOrEqual(layeredBounds.y - 0.001)
    expect(center.y).toBeLessThanOrEqual(layeredBounds.y + layeredBounds.height + 0.001)
    expect(Math.max(0, layeredBounds.x - x)).toBeLessThanOrEqual(width / 2 + 0.001)
    expect(Math.max(0, x + width - layeredBounds.x - layeredBounds.width)).toBeLessThanOrEqual(
        width / 2 + 0.001
    )
    expect(Math.max(0, layeredBounds.y - y)).toBeLessThanOrEqual(height / 2 + 0.001)
    expect(Math.max(0, y + height - layeredBounds.y - layeredBounds.height)).toBeLessThanOrEqual(
        height / 2 + 0.001
    )
}

function expectAttachedLinks(projection: SkyProjection) {
    expect(projection.inner).toHaveLength(2)
    expect(projection.cross).toHaveLength(2)
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
        (element, { ids, bounds }) => {
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
            const label = [...element.querySelectorAll('.constellation-label')]
                .find((node) => node.textContent?.trim() === 'Молитва')
                ?.getBoundingClientRect()
            const { x, y, width, height } = (element as SVGSVGElement).viewBox.baseVal
            return {
                stars,
                scale: matrix.a,
                zoom:
                    Math.max(
                        bounds.width / element.getBoundingClientRect().width,
                        bounds.height / element.getBoundingClientRect().height
                    ) * matrix.a,
                camera: { x, y, width, height },
                background: [
                    ...element.querySelectorAll<SVGPatternElement>(
                        '.constellation-background__layer'
                    ),
                ].map((layer) => {
                    const { a, b, c, d, e, f } = layer.patternTransform.baseVal.getItem(0).matrix
                    return [a, b, c, d, e, f]
                }),
                inner: Array.from(inner.points, ({ x, y }) => {
                    const screen = new DOMPoint(x, y).matrixTransform(matrix)
                    return { world: { x, y }, screen: { x: screen.x, y: screen.y } }
                }),
                cross: Array.from(cross, ({ x, y }) => ({ x, y })),
                label: label ? { x: label.x, y: label.y } : null,
            }
        },
        { ids: [...layerRoots, ...layerChildren, 'devotion'], bounds: layeredBounds }
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
        await revealTargets(page, [slash, parry])
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

async function revealTargets(page: Page, targets: Locator[]): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
        if (
            (await Promise.all(targets.map((target) => target.count()))).every((count) => count > 0)
        )
            return
        await page.getByRole('button', { name: 'Приблизить небосвод' }).click()
    }
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
