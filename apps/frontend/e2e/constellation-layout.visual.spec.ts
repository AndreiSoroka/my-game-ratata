import { expect, test } from '@playwright/test'

import { constellationFixture } from '../src/game/testing/developmentFixture'

for (const width of [390, 1280]) {
    for (const [story, heroClass] of [
        ['full-blade-development', 'vanguard'],
        ['full-mother-development', 'cleric'],
    ] as const) {
        test(`production ${heroClass} full development graph at ${width}px`, async ({
            page,
        }, info) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto(`/iframe.html?id=interface-character--${story}&viewMode=story`)
            const window = page.getByRole('dialog', { name: 'Персонаж', exact: true })
            await expect(window).toBeVisible()
            const graph = window.getByRole('group', { name: 'Созвездия развития' })
            const snapshot = constellationFixture(true, heroClass)
            await expect(graph.locator('[data-node-id]')).toHaveCount(snapshot.nodes.length)
            await expect(graph.locator('polyline')).toHaveCount(snapshot.edges.length)
            await expect(graph.locator('.constellation-edge--cross-link')).toHaveCount(
                snapshot.edges.filter((edge) => edge.crossLink).length
            )
            await expect(graph).toContainText('Угольная Мать')
            await page.screenshot({
                path: info.outputPath(`player-full-${heroClass}-${width}-overview.png`),
            })
            const rootId = snapshot.layout!.centerNodeId!
            await graph.locator(`[data-node-id="${rootId}"] .hit`).click()
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
