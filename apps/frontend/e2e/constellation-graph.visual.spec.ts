import { expect, test } from '@playwright/test'

for (const width of [320, 390, 1280]) {
    test(`full catalogue remains readable and pannable at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto('/iframe.html?id=interface-character--full-sky&viewMode=story')
        const graph = page.getByRole('group', { name: 'Созвездия развития' })
        await expect(graph).toBeVisible()
        await expect(graph.locator('[role=button]')).toHaveCount(9)
        await page.screenshot({ path: info.outputPath(`constellation-overview-${width}.png`) })
        await graph.getByRole('button', { name: 'Молитва', exact: true }).locator('.hit').click()
        await expect.poll(() => graph.locator('[role=button]').count()).toBe(77)
        const geometry = await graph.evaluate((element) => {
            const frame = element.getBoundingClientRect()
            const inside = (rect: DOMRect) =>
                rect.x >= frame.x &&
                rect.y >= frame.y &&
                rect.right <= frame.right &&
                rect.bottom <= frame.bottom
            const hits = [...element.querySelectorAll('.hit')]
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
