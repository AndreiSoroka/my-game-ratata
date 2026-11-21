import { expect, type Page, test } from '@playwright/test'

for (const viewport of [
    { width: 320, height: 480 },
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
]) {
    const { width } = viewport

    test(`character menu keeps keyboard ownership and selected tab at ${width}px`, async ({
        page,
    }, info) => {
        await page.setViewportSize(viewport)
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate(
            (name) => window.__ratataTest!.join(name, 'cleric'),
            `character-${width}-${info.workerIndex}`
        )
        await page.addStyleTag({ content: '.test-panel { display: none !important }' })
        await expect(page.getByRole('button', { name: 'Знания', exact: true })).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Ремесло', exact: true })).toHaveCount(0)
        await page.keyboard.press('KeyP')
        const menu = page.getByRole('dialog', { name: 'Персонаж', exact: true })
        await expect(menu).toBeVisible()
        await expect(menu.getByRole('tab', { name: 'Характеристики' })).toBeFocused()
        await expect(menu).toContainText('≈')
        const bonuses = menu.getByRole('region', { name: 'Постоянные бонусы прошлого' })
        await expect(bonuses).toContainText('Прошлое: Клирик')
        await expect(bonuses).toContainText('+20% опыта всех молитвенных школ')
        const before = await page.evaluate(() => window.__ratataTest!.getState().player!.position)
        await page.keyboard.press('KeyD')
        await page.keyboard.press('Digit2')
        await page.keyboard.press('ArrowRight')
        await expect(menu.getByRole('tab', { name: 'Развитие' })).toHaveAttribute(
            'aria-selected',
            'true'
        )
        await expect(bonuses).toContainText('+20% опыта всех молитвенных школ')
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
        await menu.getByRole('tab', { name: 'Квесты', exact: true }).click()
        await expect(menu.getByRole('region', { name: 'Активные квесты' })).toContainText(
            'Активных квестов нет'
        )
        await expect(menu).not.toHaveAttribute('aria-modal', 'true')
        await expectReadingMovement(page)
        await menu.getByRole('tab', { name: 'Ремесло', exact: true }).click()
        await expect(menu.getByRole('tabpanel', { name: 'Ремесло' })).toContainText(
            'Сплести сапоги'
        )
        await expect(menu).toHaveAttribute('aria-modal', 'true')
        await menu.getByRole('tab', { name: 'Развитие', exact: true }).click()
        await page.keyboard.press('Escape')
        await expect(menu).toHaveCount(0)
        await page.getByRole('button', { name: 'Игровое меню', exact: true }).click()
        await page.getByRole('button', { name: 'Персонаж · P', exact: true }).click()
        await expect(menu).toBeVisible()
        await expect(menu.getByRole('tab', { name: 'Развитие' })).toHaveAttribute(
            'aria-selected',
            'true'
        )
    })
}

async function expectReadingMovement(page: Page): Promise<void> {
    let moved = false
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
        const start = await page.evaluate(() => ({
            position: window.__ratataTest!.getState().player!.position,
            tick: window.__ratataTest!.getState().snapshot!.tick,
        }))
        await page.keyboard.down(code)
        await page.evaluate(
            (tick) => window.__ratataTest!.waitFor({ type: 'tick', after: tick + 5 }),
            start.tick
        )
        await page.keyboard.up(code)
        const end = await page.evaluate(() => window.__ratataTest!.getState().player!.position)
        if (Math.hypot(end.x - start.position.x, end.y - start.position.y) > 2) {
            moved = true
            break
        }
    }
    expect(moved).toBe(true)
}
