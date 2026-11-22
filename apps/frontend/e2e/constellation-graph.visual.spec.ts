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
        await expect(graph.locator('.constellation-label')).toContainText(['Угольная Мать'])
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
            const hits = [...element.querySelectorAll('[role=button] .hit')]
                .map((node) => node.getBoundingClientRect())
                .filter(inside)
            const labels = [...element.querySelectorAll('.constellation-label')].map((node) =>
                node.getBoundingClientRect()
            )
            const distances = hits.flatMap((a, index) =>
                hits.slice(index + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y))
            )
            const overlapping = labels.some((a, index) =>
                labels
                    .slice(index + 1)
                    .some((b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y)
            )
            return {
                hits: hits.length,
                minimumHit: Math.min(...hits.map((hit) => hit.width)),
                minimumDistance: Math.min(...distances),
                overlapping,
            }
        })
        expect(geometry.hits).toBeGreaterThan(0)
        expect(geometry.minimumHit).toBeCloseTo(44, 0)
        expect(geometry.minimumDistance).toBeGreaterThanOrEqual(52)
        expect(geometry.overlapping).toBe(false)
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

for (const { mode, initialOpacity, firstZoomOpacity } of [
    { mode: 'default', initialOpacity: '0', firstZoomOpacity: 0.021484375 },
    { mode: 'debug', initialOpacity: '0.5', firstZoomOpacity: 0.5 },
]) {
    test(`sky shows depth while retaining branch geometry in ${mode}`, async ({ page }) => {
        await page.goto(
            `/iframe.html?id=entities-constellations-constellationgraph--${mode}&viewMode=story`
        )
        const graph = page.getByRole('group', { name: 'Созвездия развития' })
        const closed = graph.locator('[data-node-id="guard"]')
        const closedLink = graph.locator('polyline').nth(1)
        const zoomIn = page.getByRole('button', { name: 'Приблизить небосвод' })
        const zoomOut = page.getByRole('button', { name: 'Отдалить небосвод' })
        const reset = page.getByRole('button', { name: 'Показать весь небосвод' })
        const background = graph.locator('.constellation-background__layer')
        await expect(background).toHaveCount(5)
        const firstLayer = background.first()
        const initialTransform = (await firstLayer.getAttribute('patternTransform'))!
        await expect(closed).toHaveCSS('opacity', initialOpacity)
        await expect(closedLink).toHaveCSS('opacity', String(Number(initialOpacity) * 0.4))
        await zoomIn.click()
        const scales = await background.evaluateAll((layers) =>
            layers.map(
                (layer) => (layer as SVGPatternElement).patternTransform.baseVal.getItem(0).matrix.a
            )
        )
        expect(scales[0]).toBeGreaterThan(1)
        expect(scales.at(-1)).toBeGreaterThan(scales[0]!)
        const opacity = await closed.evaluate((node) => Number(getComputedStyle(node).opacity))
        expect(opacity).toBeCloseTo(firstZoomOpacity, 4)
        const linkOpacity = await closedLink.evaluate((node) =>
            Number(getComputedStyle(node).opacity)
        )
        expect(linkOpacity).toBeCloseTo(firstZoomOpacity * 0.4, 4)
        for (let step = 0; step < 4; step++) await zoomIn.click()
        await expect(closed).toHaveCSS('opacity', '0.5')
        await expect(closedLink).toHaveCSS('opacity', '0.2')
        await zoomOut.click()
        await reset.click()
        await expect(closed).toHaveCSS('opacity', initialOpacity)
        await expect(firstLayer).toHaveAttribute('patternTransform', initialTransform)

        const before = await branchProjection(graph)
        const bounds = (await graph.boundingBox())!
        await page.mouse.move(bounds.x + 30, bounds.y + bounds.height - 20)
        await page.mouse.down()
        await page.mouse.move(bounds.x + 130, bounds.y + bounds.height - 20, { steps: 5 })
        await page.mouse.up()
        const after = await branchProjection(graph)
        expect(after.blade - before.blade).toBeCloseTo(100, 0)
        expect(after.grave - before.grave).toBeGreaterThanOrEqual(93.9)
        expect(after.grave - before.grave).toBeLessThan(98)
        expect(after.link).toEqual([after.slashWorld, after.graveWorld])
        await graph.getByRole('button', { name: 'Клинок', exact: true }).press('Enter')
        const focused = await branchProjection(graph)
        expect(focused.link).toEqual(before.link)
        await reset.click()
        expect(await branchProjection(graph)).toEqual(before)
    })
}

function branchProjection(graph: Locator) {
    return graph.evaluate((element) => {
        const position = (id: string) => {
            const node = element.querySelector<SVGGElement>(`[data-node-id="${id}"]`)!
            return {
                screen: node.getCTM()!.e,
                world: node.transform.baseVal.getItem(0).matrix.e,
            }
        }
        const blade = position('blade')
        const grave = position('grave')
        const slash = position('slash')
        const points = element.querySelector<SVGPolylineElement>(
            '.constellation-edge--cross-link'
        )!.points
        return {
            blade: blade.screen,
            grave: grave.screen,
            slashWorld: slash.world,
            graveWorld: grave.world,
            link: [points.getItem(0).x, points.getItem(points.length - 1).x],
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
