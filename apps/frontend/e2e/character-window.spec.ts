import type { ClientMessage } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

import { expectCharacterWindowAppearance, heroThemeCases } from './hero-theme-visual'

const cleric = heroThemeCases[3]

for (const viewport of [
    { width: 320, height: 480 },
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
]) {
    const { width } = viewport

    test(`character menu keeps keyboard ownership and selected tab at ${width}px`, async ({
        page,
    }, info) => {
        const movementCount = trackMovementCommands(page)
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
        const statistics = menu.getByRole('tab', { name: 'Характеристики' })
        const development = menu.getByRole('tab', { name: 'Развитие' })
        const close = menu.getByRole('button', { name: 'Закрыть персонажа' })
        await expect(statistics).toHaveClass(/\bui-button\b/)
        await expect(close).toHaveClass(/\bui-button\b/)
        await expect(statistics).toBeFocused()
        await expect(statistics).toHaveAttribute('data-highlighted', 'true')
        await expect(development).toHaveAttribute('tabindex', '-1')
        await expect(menu).toContainText('≈')
        await expectCharacterWindowAppearance(menu, cleric)
        const bonuses = menu.getByRole('region', { name: 'Постоянные бонусы прошлого' })
        await expect(bonuses).toContainText('+20% опыта всех молитвенных школ')
        const before = await page.evaluate(() => window.__ratataTest!.getState().player!.position)
        await page.keyboard.press('KeyD')
        await expect(development).toBeFocused()
        await page.keyboard.press('KeyA')
        await expect(statistics).toBeFocused()
        await page.keyboard.press('Digit2')
        await page.keyboard.press('ArrowRight')
        await expect(development).toHaveAttribute('aria-selected', 'true')
        await expect(development).toHaveAttribute('data-highlighted', 'true')
        await expect(development).toBeFocused()
        await expect(statistics).toHaveAttribute('data-highlighted', 'false')
        await expect(statistics).toHaveAttribute('tabindex', '-1')
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
        await expect(development).toHaveAttribute('aria-selected', 'true')
        const backdrop = page.locator('.character-backdrop')
        const backdropColor = await backdrop.evaluate(
            (element) => getComputedStyle(element).backgroundColor
        )
        await menu.getByRole('tab', { name: 'Квесты', exact: true }).click()
        await expect(menu.getByRole('region', { name: 'Активные квесты' })).toContainText(
            'Активных квестов нет'
        )
        await expect(backdrop).toHaveCSS('background-color', backdropColor)
        await expect(menu).toHaveAttribute('aria-modal', 'true')
        await expectQuestReaderBlocksMovement(page, movementCount)
        await expect(menu).toBeVisible()
        await menu.getByRole('tab', { name: 'Ремесло', exact: true }).click()
        await expect(menu.getByRole('tabpanel', { name: 'Ремесло' })).toContainText(
            'Сплести сапоги'
        )
        await expect(menu).toHaveAttribute('aria-modal', 'true')
        await menu.getByRole('tab', { name: 'Развитие', exact: true }).click()
        await page.keyboard.press('Escape')
        await expect(menu).toHaveCount(0)
        await expect(page.locator('canvas[data-game-canvas]')).toBeFocused()
        await page.getByRole('button', { name: 'Игровое меню', exact: true }).click()
        await page.getByRole('button', { name: 'Персонаж · P', exact: true }).click()
        await expect(menu).toBeVisible()
        await expect(development).toHaveAttribute('aria-selected', 'true')
        await close.click()
        await expect(menu).toHaveCount(0)
        await expect(page.locator('canvas[data-game-canvas]')).toBeFocused()
    })
}

async function expectQuestReaderBlocksMovement(
    page: Page,
    movementCount: () => number
): Promise<void> {
    const before = movementCount()
    const start = await page.evaluate(() => ({
        position: window.__ratataTest!.getState().player!.position,
        tick: window.__ratataTest!.getState().snapshot!.tick,
    }))
    await page.keyboard.down('KeyW')
    try {
        await page.evaluate(
            (tick) => window.__ratataTest!.waitFor({ type: 'tick', after: tick + 2 }),
            start.tick
        )
    } finally {
        await page.keyboard.up('KeyW')
    }
    // Moving focus onto the canvas must not give it keyboard ownership while the dialog is open.
    await page.locator('canvas[data-game-canvas]').focus()
    const outsideFocusTick = await page.evaluate(
        () => window.__ratataTest!.getState().snapshot!.tick
    )
    await page.keyboard.down('KeyS')
    try {
        await page.keyboard.press('Space')
        await page.evaluate(
            (tick) => window.__ratataTest!.waitFor({ type: 'tick', after: tick + 2 }),
            outsideFocusTick
        )
    } finally {
        await page.keyboard.up('KeyS')
    }
    expect(movementCount()).toBe(before)
    expect(await page.evaluate(() => window.__ratataTest!.getState().player!.position)).toEqual(
        start.position
    )
}

function trackMovementCommands(page: Page): () => number {
    let count = 0
    page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname !== '/ws') return
        socket.on('framesent', ({ payload }) => {
            if (typeof payload !== 'string') return
            const command = JSON.parse(payload) as ClientMessage
            if (
                command.type === 'dash' ||
                (command.type === 'move_input' && (command.axis.x !== 0 || command.axis.y !== 0))
            )
                count += 1
        })
    })
    return () => count
}
