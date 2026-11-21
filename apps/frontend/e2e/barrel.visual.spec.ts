import { expect, type Locator, test } from '@playwright/test'

for (const width of [1280, 390, 320]) {
    for (const state of ['barrel', 'empty-barrel']) {
        test(`production ${state} at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto(`/iframe.html?id=shared-chestcontainer--${state}&viewMode=story`)
            const window = page.getByRole('dialog', { name: 'Рюкзак и бочка' })
            await expect(window).toBeVisible()
            await page.evaluate(async () => {
                await document.fonts.ready
            })
            await expect(
                window.getByRole('heading', { name: 'Бочка общих припасов' })
            ).toBeVisible()
            await expect(window.getByRole('button', { name: 'Закрыть контейнер' })).toBeVisible()
            await expect(window.getByRole('button', { name: /Топор/ })).toBeEnabled()
            await expectContents(window, state)
            await expectContained(window)
            await expect(window).toHaveScreenshot(`${state}-${width}.png`)
        })
    }
}

async function expectContents(panel: Locator, state: string): Promise<void> {
    const takeAll = panel.getByRole('button', { name: 'Забрать всё' })
    if (state === 'barrel') {
        await expect(panel.getByRole('button', { name: /Древесина/ })).toBeEnabled()
        await expect(panel.getByRole('button', { name: /Волокно/ })).toBeEnabled()
        await expect(takeAll).toBeEnabled()
    } else {
        await expect(panel).toContainText('Контейнер пуст.')
        await expect(takeAll).toBeDisabled()
    }
}

async function expectContained(window: Locator): Promise<void> {
    const geometry = await window.evaluate((panel) => {
        const rect = panel.getBoundingClientRect()
        return {
            left: rect.left,
            right: rect.right,
            viewport: globalThis.innerWidth,
            pageOverflow: document.documentElement.scrollWidth > globalThis.innerWidth,
            contentOverflow: panel.scrollWidth > panel.clientWidth,
            contained: Array.from(panel.querySelectorAll('button, h2, h3')).every((element) => {
                const bounds = element.getBoundingClientRect()
                return bounds.left >= rect.left && bounds.right <= rect.right
            }),
        }
    })
    expect(geometry.left).toBeGreaterThanOrEqual(0)
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport)
    expect(geometry.pageOverflow).toBe(false)
    expect(geometry.contentOverflow).toBe(false)
    expect(geometry.contained).toBe(true)
}
