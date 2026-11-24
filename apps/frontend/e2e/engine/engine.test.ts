import { expect, test } from '@playwright/test'

import type {} from './harness'

const webgl2 = { webgl2: true, lost: false, lostEvents: 0, preserve: false }

test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/engine/')
    await page.getByRole('button', { name: 'Enable engine audio' }).click()
})

test('renders moving, depth-sorted particles and uploads changed raster pixels', async ({
    page,
}) => {
    const result = await page.evaluate(() => window.engineHarness.render())
    expect(result).toMatchObject({
        ...webgl2,
        active: 12,
        depth: [79],
        movedRight: true,
        occluded: 0,
        expired: 0,
        released: 0,
        textureColors: [
            [192, 48, 32],
            [32, 144, 204],
        ],
    })
    expect(result.visible).toBeGreaterThan(0)
})

test('plays isolated real tracks and restores one music track when visible', async ({ page }) => {
    const result = await page.evaluate(() => window.engineHarness.audio())
    expect(result).toMatchObject({
        audioBeforeLoad: 'running',
        forcedMute: false,
        independentSounds: true,
        footsteps: {
            voices: 8,
            completed: Array.from({ length: 8 }, () => true),
            afterCompletion: 2,
            afterStop: 1,
            external: [true, 0.25, 1.2],
        },
        music: {
            firstCount: 1,
            hidden: { paused: true, count: 1 },
            resumed: { same: true, count: 1 },
            muted: 0,
            unmuted: { same: false, count: 1 },
        },
    })
    expect(result.sampleVolume).toBeCloseTo(result.catalogVolume)
    const [near, far] = result.footsteps.settings
    expect(near).toEqual([0.8, 0.96])
    expect(far?.[0]).toBeCloseTo(0.3)
    expect(far?.[1]).toBe(1)
})

test('cancels application resources immediately and drains the old loader after reentry', async ({
    page,
}) => {
    const result = await page.evaluate(() => window.engineHarness.cancel())
    expect(result).toEqual({
        immediate: { attached: false, running: true, disposed: false, cleanupCalls: 1 },
        abandonedReady: false,
        loaderCompleted: true,
        disposed: true,
        running: false,
        cleanupCalls: 1,
        replacement: { ...webgl2, attached: true, ready: true, running: true },
    })
})

test('disposes failed initialization and incomplete resource loads', async ({ page }) => {
    const result = await page.evaluate(() => window.engineHarness.fail())
    const disposed = { attached: false, clock: false, disposed: true }
    expect(result.initialization).toMatchObject({ ...disposed, engineReady: false })
    expect(result.initialization.message).toContain('Fixture scene initialization failed')
    expect(result.partial).toMatchObject({ ...disposed, engineReady: true })
    expect(result.partial.message).toContain('did not finish loading')
    expect(result.loaded).toEqual([false, true, false])
})

test('reentry beyond the context limit releases retired WebGL2 contexts', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
        const content = message.text()
        if (message.type() === 'error' || /too many active WebGL contexts/i.test(content)) {
            errors.push(content)
        }
    })

    const entries = 20
    const result = await page.evaluate((count) => window.engineHarness.reenter(count), entries)
    expect(result).toEqual(
        Array.from({ length: entries }, () => ({ live: webgl2, retiredLost: true }))
    )
    await expect(page.locator('#ex-webgl-graphics-context-lost')).toHaveCount(0)
    expect(errors).toEqual([])
})
