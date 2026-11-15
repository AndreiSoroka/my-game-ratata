import { expect, test } from '@playwright/test'

for (const width of [320, 390, 1280]) {
    test(`character menu keeps keyboard ownership and selected tab at ${width}px`, async ({
        page,
    }, info) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate(
            (name) => window.__ratataTest!.join(name, 'cleric'),
            `character-${width}-${info.workerIndex}`
        )
        await page.addStyleTag({ content: '.test-panel { display: none !important }' })
        await page.keyboard.press('KeyP')
        const menu = page.getByRole('dialog', { name: 'Персонаж', exact: true })
        await expect(menu).toBeVisible()
        await expect(menu.getByRole('tab', { name: 'Характеристики' })).toBeFocused()
        await expect(menu).toContainText('≈')
        const before = await page.evaluate(() => window.__ratataTest!.getState().player!.position)
        await page.keyboard.press('KeyD')
        await page.keyboard.press('Digit2')
        await page.keyboard.press('ArrowRight')
        await expect(menu.getByRole('tab', { name: 'Развитие' })).toHaveAttribute(
            'aria-selected',
            'true'
        )
        const graph = menu.getByRole('group', { name: 'Созвездия развития' })
        await expect(graph).toBeVisible()
        await expect
            .poll(() =>
                graph.evaluate((element) => {
                    const box = (element as SVGSVGElement).viewBox.baseVal
                    const rect = element.getBoundingClientRect()
                    return Math.abs(box.width / box.height - rect.width / rect.height)
                })
            )
            .toBeLessThan(0.001)
        const original = await graph.getAttribute('viewBox')
        await menu.getByRole('button', { name: 'Приблизить небосвод' }).click()
        await expect(graph).not.toHaveAttribute('viewBox', original!)
        await menu.getByRole('button', { name: 'Показать весь небосвод' }).click()
        await expect(graph).toHaveAttribute('viewBox', original!)
        const body = await menu.boundingBox()
        expect(body!.x).toBeGreaterThanOrEqual(0)
        expect(body!.x + body!.width).toBeLessThanOrEqual(width)
        expect(await page.evaluate(() => window.__ratataTest!.getState().player!.position)).toEqual(
            before
        )
        await page.keyboard.press('KeyP')
        await expect(menu).toHaveCount(0)
        await page.keyboard.press('KeyP')
        await expect(menu.getByRole('tab', { name: 'Развитие' })).toHaveAttribute(
            'aria-selected',
            'true'
        )
        await page.keyboard.press('Escape')
        await expect(menu).toHaveCount(0)
        await page.getByRole('button', { name: 'Знания', exact: true }).click()
        await expect(menu.getByRole('tab', { name: 'Развитие' })).toHaveAttribute(
            'aria-selected',
            'true'
        )
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: 'Игровое меню', exact: true }).click()
        await page.getByRole('button', { name: 'Персонаж · P', exact: true }).click()
        await expect(menu).toBeVisible()
    })
}
