import { expect, type Page, test, type TestInfo } from '@playwright/test'

test.describe('routes, private markers and scenario editor', () => {
    test.setTimeout(90_000)
    test.use({ actionTimeout: 10_000 })
    for (const { mode, viewport } of [
        { mode: 'desktop', viewport: { width: 1280, height: 800 } },
        { mode: 'mobile', viewport: { width: 390, height: 844 } },
    ]) {
        test(`queues clicks and edits a repeatable scenario (${mode})`, async ({ page }, info) => {
            await page.setViewportSize(viewport)
            await page.goto('/?test=1')
            await page.waitForFunction(() => Boolean(window.__ratataTest))
            await page.evaluate(
                (name) => window.__ratataTest!.join(name, 'vanguard'),
                `auto-${info.workerIndex}-${mode[0]}-${Date.now().toString(36)}`
            )
            await expect(page.locator('canvas[data-game-canvas=true]')).toBeVisible()
            await queueClicks(page)
            await capture(page, info, 'numbered-route')
            await page.keyboard.press('KeyW')
            await expect
                .poll(() =>
                    page.evaluate(() => window.__ratataTest!.getState().player?.control?.mode)
                )
                .toBe('none')

            await page.keyboard.press('KeyN')
            await expectMarkerCount(page, 1)
            await page.getByRole('button', { name: 'Поставить метку', exact: true }).click()
            await expectMarkerCount(page, 2)
            await openPanel(page, 'Метки')
            const markers = page.getByRole('dialog', { name: 'Метки', exact: true })
            await markers.getByLabel('Название метки 1', { exact: true }).fill('Camp')
            await page.keyboard.press('KeyN')
            await expectMarkerCount(page, 2)
            await markers
                .getByRole('button', { name: 'Переименовать метку 1', exact: true })
                .click()
            await expect
                .poll(() =>
                    page.evaluate(
                        () => window.__ratataTest!.getState().snapshot?.automation?.markers[0]?.name
                    )
                )
                .toBe('Campn')
            await page.keyboard.press('Escape')
            await expect(markers).toBeHidden()

            await openPanel(page, 'Сценарии')
            const editor = page.getByRole('dialog', { name: 'Сценарии', exact: true })
            const name = `Wait scenario ${mode}`
            await editor.getByLabel('Название сценария', { exact: true }).fill(name)
            await editor.getByLabel('Если рядом враг').selectOption('continue')
            await editor.getByLabel('Новый шаг').selectOption('wait')
            await editor.getByRole('button', { name: 'Добавить шаг', exact: true }).click()
            await editor.getByLabel('Секунд', { exact: true }).fill('30')
            await editor.getByRole('button', { name: 'Добавить шаг', exact: true }).click()
            await editor.getByLabel('Секунд', { exact: true }).nth(1).fill('20')
            await editor.getByRole('button', { name: 'Поднять шаг 2', exact: true }).click()
            await expect(editor.getByLabel('Секунд', { exact: true }).first()).toHaveValue('20')
            await editor.getByRole('button', { name: 'Сохранить', exact: true }).click()
            await expect
                .poll(() =>
                    page.evaluate(
                        (scenarioName) =>
                            window
                                .__ratataTest!.getState()
                                .snapshot?.automation?.scenarios.find(
                                    (scenario) => scenario.name === scenarioName
                                )
                                ?.steps.map((step) => (step.kind === 'wait' ? step.durationMs : 0)),
                        name
                    )
                )
                .toEqual([20_000, 30_000])
            await editor.getByRole('button', { name: 'Запустить', exact: true }).click()
            await expectRun(page, 'running')
            await editor.getByRole('button', { name: 'Пауза', exact: true }).click()
            await expectRun(page, 'paused')
            await capture(page, info, 'scenario-editor')
            const box = await editor.boundingBox()
            expect(box?.x).toBeGreaterThanOrEqual(0)
            expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width)
            await editor.getByRole('button', { name: 'Продолжить', exact: true }).click()
            await expectRun(page, 'running')
            await page.keyboard.press('Escape')
            await expect(editor).toBeHidden()
            await openPanel(page, 'Сценарии')
            await expectRun(page, 'running')
            await editor.getByRole('button', { name: 'Остановить', exact: true }).click()
            await expectRun(page, 'stopped')
        })
    }
})

async function queueClicks(page: Page): Promise<void> {
    const points = await page.evaluate(() => {
        const state = window.__ratataTest!.getState()
        const player = state.player!
        const canvas = document.querySelector('canvas[data-game-canvas=true]')!
        const rect = canvas.getBoundingClientRect()
        const coordinates = Array.from({ length: 13 }, (_, index) => (index - 6) * 16)
        return coordinates
            .flatMap((x) => coordinates.map((y) => ({ x, y })))
            .filter((offset) => Math.hypot(offset.x, offset.y) >= 48)
            .map((offset) => ({ x: player.position.x + offset.x, y: player.position.y + offset.y }))
            .filter(
                (point) =>
                    !state.snapshot!.characters.some(
                        (actor) =>
                            actor.id !== player.id &&
                            Math.hypot(actor.position.x - point.x, actor.position.y - point.y) < 28
                    )
            )
            .map((point) => window.__ratataGameDebug?.worldToPage(point))
            .filter((point): point is { x: number; y: number } =>
                Boolean(
                    point &&
                    point.x > rect.left + 10 &&
                    point.x < rect.right - 10 &&
                    point.y > rect.top + 10 &&
                    point.y < rect.bottom - 10 &&
                    document.elementFromPoint(point.x, point.y) === canvas
                )
            )
            .slice(0, 3)
    })
    expect(points).toHaveLength(3)
    await page.keyboard.down('Shift')
    for (const point of points) await page.mouse.click(point.x, point.y)
    await page.keyboard.up('Shift')
    await expect
        .poll(() =>
            page.evaluate(() =>
                window
                    .__ratataTest!.getState()
                    .player?.control?.route?.points.map((point) => point.number)
            )
        )
        .toEqual([1, 2, 3])
}

async function openPanel(page: Page, name: 'Метки' | 'Сценарии'): Promise<void> {
    await page.getByRole('button', { name: 'Игровое меню', exact: true }).click()
    await page
        .getByRole('dialog', { name: 'Игровое меню', exact: true })
        .getByRole('button', { name, exact: true })
        .click()
    await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible()
}

async function expectMarkerCount(page: Page, count: number): Promise<void> {
    await expect
        .poll(() =>
            page.evaluate(
                () => window.__ratataTest!.getState().snapshot?.automation?.markers.length
            )
        )
        .toBe(count)
}

async function expectRun(page: Page, status: string): Promise<void> {
    await expect
        .poll(() =>
            page.evaluate(() => window.__ratataTest!.getState().snapshot?.automation?.run?.status)
        )
        .toBe(status)
}

async function capture(page: Page, info: TestInfo, name: string): Promise<void> {
    const path = info.outputPath(`${name}.png`)
    await page.screenshot({ path })
    await info.attach(name, { path, contentType: 'image/png' })
}
