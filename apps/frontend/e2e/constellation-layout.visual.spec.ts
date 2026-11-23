import {
    constellationIds,
    type ConstellationNodeSnapshot,
    type Vector2,
} from '@my-game-ratata/contracts'
import { expect, type Locator, type Page, test } from '@playwright/test'

import { constellationFixture, fixtureStarId } from '../src/game/testing/developmentFixture'

for (const width of [390, 1280]) {
    for (const [story, heroClass] of [
        ['full-blade-development', 'vanguard'],
        ['full-mother-development', 'cleric'],
    ] as const) {
        test(`production ${heroClass} full development graph at ${width}px`, async ({
            page,
        }, info) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto(`/iframe.html?id=game-characterwindow--${story}&viewMode=story`)
            const window = page.getByRole('dialog', { name: 'Персонаж', exact: true })
            await expect(window).toBeVisible()
            const graph = window.getByRole('group', { name: 'Созвездия развития' })
            const snapshot = constellationFixture(true, heroClass)
            await expect(graph.locator('[data-node-id]')).toHaveCount(snapshot.nodes.length)
            await expect(graph.locator('polyline')).toHaveCount(snapshot.edges.length)
            await expect(graph.locator('.constellation-edge--cross-link')).toHaveCount(
                snapshot.edges.filter((edge) => edge.crossLink).length
            )
            const rootId = snapshot.layout!.centerNodeId!
            const root = graph.locator(`[data-node-id="${rootId}"]`)
            await expect(root).toHaveAttribute('role', 'button')
            await expect(graph.locator('.constellation-label').first()).toBeVisible()
            await page.screenshot({
                path: info.outputPath(`player-full-${heroClass}-${width}-overview.png`),
            })
            await root.locator('.hit').click()
            const path = snapshot.nodes.find((node) => node.id === rootId)!.constellationId
            const pathIds = snapshot.nodes
                .filter((node) => node.constellationId === path)
                .map((node) => node.id)
            const markers = await graph.evaluate((element, ids) => {
                const frame = element.getBoundingClientRect()
                const points = ids.map((id) =>
                    element.querySelector(`[data-node-id="${id}"] .hit`)!.getBoundingClientRect()
                )
                return {
                    count: points.length,
                    inside: points.every(
                        (rect) =>
                            rect.left >= frame.left &&
                            rect.right <= frame.right &&
                            rect.top >= frame.top &&
                            rect.bottom <= frame.bottom
                    ),
                }
            }, pathIds)
            expect(markers.count).toBe(42)
            expect(markers.inside).toBe(true)
            await page.screenshot({
                path: info.outputPath(`player-full-${heroClass}-${width}-focused.png`),
            })
        })
    }
}

for (const width of [390, 1280]) {
    test(`perspective depth grows with the same native pan at close zoom across the catalogue at ${width}px`, async ({
        page,
    }, info) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(
            '/iframe.html?id=game-characterwindow--full-blade-development&viewMode=story'
        )
        const graph = page.getByRole('group', { name: 'Созвездия развития' })
        const snapshot = constellationFixture(true, 'vanguard')
        const root = graph.locator(`[data-node-id="${fixtureStarId('arrow.root')}"]`)
        await expect(root).toHaveAttribute('role', 'button')
        const reset = page.getByRole('button', { name: 'Показать весь небосвод' })
        const zoomIn = page.getByRole('button', { name: 'Приблизить небосвод' })
        await reset.click()
        const overview = await catalogueProjection(graph)
        const bounds = snapshot.layout!.bounds
        const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
        const responses: number[] = []
        for (const level of [
            { clicks: 0, minimumResponse: -0.001, minimumAdjacent: 0 },
            { clicks: 6, minimumResponse: 14, minimumAdjacent: 3 },
            { clicks: 13, minimumResponse: 18, minimumAdjacent: 3 },
            { clicks: 40, minimumResponse: 19.5, minimumAdjacent: 3 },
        ]) {
            await reset.click()
            for (let step = 0; step < level.clicks; step++) await zoomIn.click()
            const samples = []
            for (const side of [-1, 0, 1]) {
                await moveCameraTo(page, graph, {
                    x: center.x + (side * bounds.width) / 4,
                    y: center.y,
                })
                const before = await catalogueProjection(graph)
                await panSky(page, graph, { x: 100, y: 0 })
                const after = await catalogueProjection(graph)
                expect(
                    Math.abs(
                        (after.camera.x +
                            after.camera.width / 2 -
                            (before.camera.x + before.camera.width / 2)) *
                            after.scale +
                            100
                    )
                ).toBeLessThan(0.01)
                expectAffinePlanes(snapshot, overview, after)
                expectCatalogueLinks(snapshot, after)
                samples.push({ before, after })
            }
            const first = samples[0]!
            for (const node of snapshot.nodes) {
                const reference = displacement(
                    first.before.stars[node.id]!.world,
                    first.after.stars[node.id]!.world
                )
                for (const sample of samples.slice(1)) {
                    const response = displacement(
                        sample.before.stars[node.id]!.world,
                        sample.after.stars[node.id]!.world
                    )
                    expect(
                        Math.hypot(reference.x - response.x, reference.y - response.y) *
                            sample.after.scale,
                        `Star ${node.id} responds equally on the left, middle and right`
                    ).toBeLessThan(0.02)
                }
            }
            const rootResponses = ['blade', 'magic', 'prayer', 'arrow', 'life'].map((path) => {
                const id = fixtureStarId(`${path}.root`)
                const value = displacement(
                    first.before.stars[id]!.world,
                    first.after.stars[id]!.world
                )
                return { x: value.x * first.after.scale, y: value.y * first.after.scale }
            })
            const response = Math.max(...rootResponses.map(({ x, y }) => Math.hypot(x, y)))
            expect(response).toBeGreaterThan(level.minimumResponse)
            for (let layer = 1; layer < rootResponses.length; layer++)
                expect(
                    Math.hypot(
                        rootResponses[layer]!.x - rootResponses[layer - 1]!.x,
                        rootResponses[layer]!.y - rootResponses[layer - 1]!.y
                    )
                ).toBeGreaterThanOrEqual(level.minimumAdjacent)
            responses.push(response)
        }
        expect(responses[0]).toBeCloseTo(0, 3)
        expect(responses[1]).toBeGreaterThan(responses[0]!)
        expect(responses[2]).toBeGreaterThan(responses[1]!)
        expect(responses[3]).toBeGreaterThan(responses[2]!)
        await root.press('Enter')
        await root.locator('.hit').click()
        await expect(root).toBeFocused()
        await expect(root).toHaveAttribute('aria-current', 'true')
        expectCatalogueLinks(snapshot, await catalogueProjection(graph))
        await page.screenshot({ path: info.outputPath(`perspective-depth-${width}.png`) })
        await reset.click()
        const restored = await catalogueProjection(graph)
        for (const id of Object.keys(overview.stars))
            expect(
                Math.hypot(
                    restored.stars[id]!.world.x - overview.stars[id]!.world.x,
                    restored.stars[id]!.world.y - overview.stars[id]!.world.y
                )
            ).toBeLessThan(0.01)
    })
}

type CatalogueProjection = Awaited<ReturnType<typeof catalogueProjection>>

function nodeDepth(node: ConstellationNodeSnapshot): number {
    if (node.parents.length === 0) return (constellationIds.indexOf(node.constellationId) % 5) / 4
    let hash = 0
    for (const symbol of node.id) hash = Math.imul(hash, 31) + symbol.charCodeAt(0)
    return ((hash >>> 0) % 5) / 4
}

function expectAffinePlanes(
    snapshot: ReturnType<typeof constellationFixture>,
    overview: CatalogueProjection,
    current: CatalogueProjection
): void {
    const zoom = Math.max(1, current.scale / overview.scale)
    const center = {
        x: current.camera.x + current.camera.width / 2,
        y: current.camera.y + current.camera.height / 2,
    }
    for (const node of snapshot.nodes) {
        const factor = 1 / (1 + nodeDepth(node) * 0.25 * (1 - 1 / zoom))
        const original = overview.stars[node.id]!.world
        const projected = current.stars[node.id]!.world
        expect(
            Math.hypot(
                projected.x - center.x - (original.x - center.x) * factor,
                projected.y - center.y - (original.y - center.y) * factor
            ) * current.scale,
            `Star ${node.id} keeps the uniform similarity transform of its global plane`
        ).toBeLessThan(0.02)
    }
}

function expectCatalogueLinks(
    snapshot: ReturnType<typeof constellationFixture>,
    current: CatalogueProjection
): void {
    for (const [index, edge] of snapshot.edges.entries()) {
        const points = current.edges[index]!
        for (const [point, id] of [
            [points[0]!, edge.from],
            [points.at(-1)!, edge.to],
        ] as const) {
            expect(point.x).toBeCloseTo(current.stars[id]!.world.x, 2)
            expect(point.y).toBeCloseTo(current.stars[id]!.world.y, 2)
        }
    }
}

async function moveCameraTo(page: Page, graph: Locator, target: Vector2): Promise<void> {
    const current = await catalogueProjection(graph)
    await panSky(page, graph, {
        x: (current.camera.x + current.camera.width / 2 - target.x) * current.scale,
        y: (current.camera.y + current.camera.height / 2 - target.y) * current.scale,
    })
}

function catalogueProjection(graph: Locator) {
    return graph.evaluate((element) => {
        const stars: Record<string, { screen: Vector2; world: Vector2 }> = {}
        for (const node of element.querySelectorAll<SVGGElement>('[data-node-id]')) {
            const id = node.dataset.nodeId!
            const [x, y] = node
                .getAttribute('transform')!
                .slice('translate('.length, -1)
                .split(',')
                .map(Number) as [number, number]
            const screen = node.getScreenCTM()!
            stars[id] = { world: { x, y }, screen: { x: screen.e, y: screen.f } }
        }
        const graph = element as SVGSVGElement
        const [x, y, width, height] = graph.getAttribute('viewBox')!.split(/\s+/).map(Number) as [
            number,
            number,
            number,
            number,
        ]
        return {
            stars,
            scale: graph.getScreenCTM()!.a,
            camera: { x, y, width, height },
            edges: [...element.querySelectorAll<SVGPolylineElement>('polyline')].map((edge) =>
                Array.from(edge.points, ({ x, y }) => ({ x, y }))
            ),
        }
    })
}

function displacement(before: Vector2, after: Vector2): Vector2 {
    return { x: after.x - before.x, y: after.y - before.y }
}

async function panSky(page: Page, graph: Locator, pan: Vector2): Promise<void> {
    const bounds = (await graph.boundingBox())!
    const x = bounds.x + 30
    const y = bounds.y + bounds.height - 50
    await page.mouse.move(x, y)
    await page.mouse.down()
    const captureProgress = Math.min(1, 3 / Math.hypot(pan.x, pan.y))
    await page.mouse.move(x + pan.x * captureProgress, y + pan.y * captureProgress)
    await page.mouse.move(x + pan.x, y + pan.y, { steps: 5 })
    await page.mouse.up()
}
