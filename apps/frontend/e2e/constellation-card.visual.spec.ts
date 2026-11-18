import { expect, test } from '@playwright/test'

for (const width of [320, 390, 1280]) {
    test(`spell card spacing and classification at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto('/iframe.html?id=interface-constellation-star--prayer&viewMode=story')
        const card = page.getByLabel('Выбранная звезда')
        await expect(card).toContainText('Активное заклинание')
        const spacing = await card.evaluate((element) => {
            const blocks = [...element.children]
                .filter((child) => child.getAttribute('aria-hidden') !== 'true')
                .map((child) => child.getBoundingClientRect())
            const bullets = [...element.querySelectorAll('li')].map((child) =>
                child.getBoundingClientRect()
            )
            return {
                blocks: blocks.slice(1).map((block, index) => block.y - blocks[index]!.bottom),
                bullets: bullets.slice(1).map((block, index) => block.y - bullets[index]!.bottom),
                padding: getComputedStyle(element.querySelector('ul')!).paddingLeft,
            }
        })
        expect(spacing.blocks).toEqual([12, 12, 12])
        expect(spacing.bullets.length).toBeGreaterThan(0)
        expect(spacing.bullets.every((gap) => gap === 4)).toBe(true)
        expect(spacing.padding).toBe('18px')
        await page.screenshot({ path: info.outputPath(`spell-card-${width}.png`) })
        await page.goto(
            '/iframe.html?id=interface-constellation-star--physical-passive&viewMode=story'
        )
        await expect(card).toContainText('Пассивный навык')
        await expect(card).not.toContainText('Пассивная способность')
        await page.goto('/iframe.html?id=interface-constellation-star--resurrection&viewMode=story')
        await expect(card).toContainText('Пассивный навык')
        await page.goto('/iframe.html?id=interface-constellation-star--unknown&viewMode=story')
        await expect(card).toHaveText('Неизвестно')
    })
}
