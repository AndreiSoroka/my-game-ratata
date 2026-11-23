import { expect, test } from '@playwright/test'

test('keeps test sessions silent before startup and during movement, combat and menus', async ({
    page,
}, info) => {
    await page.addInitScript(() => {
        const recorded: number[] = []
        Object.defineProperty(window, '__ratataAudioStarts', { value: recorded })
        const start = AudioBufferSourceNode.prototype.start
        AudioBufferSourceNode.prototype.start = function (...args) {
            // Browsers may unlock Web Audio with an inaudible one-sample buffer.
            if (this.buffer && this.buffer.length > 1) recorded.push(this.buffer.duration)
            return start.apply(this, args)
        }
    })
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.evaluate(
        (name) => window.__ratataTest!.join(name, 'vanguard'),
        `silent-${info.project.name}`
    )
    await expect(page.locator('canvas[data-game-canvas=true]')).toBeVisible()
    await page.evaluate(async () => {
        const api = window.__ratataTest!
        await api.moveFor({ x: 1, y: 0 }, 1200)
        await api.act({ type: 'attack' })
    })
    await page.getByRole('button', { name: 'Игровое меню', exact: true }).click()
    const menu = page.getByRole('dialog', { name: 'Игровое меню' })
    await expect(menu).toBeVisible()
    const silent = menu.getByRole('button', { name: 'Без звука', exact: true })
    await expect(silent).toBeDisabled()
    await expect(silent).toHaveAttribute('aria-pressed', 'true')
    expect(
        await page.evaluate(
            () => (window as unknown as { __ratataAudioStarts: number[] }).__ratataAudioStarts
        )
    ).toEqual([])
})
