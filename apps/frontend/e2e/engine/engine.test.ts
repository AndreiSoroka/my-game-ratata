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
        menuOpen: { path: '/game/assets/audio/kenney-rpg-audio/bookPlace1.ogg', tracks: 1 },
        slotSelect: { path: '/game/assets/audio/kenney-ui-audio/rollover2.ogg', tracks: 1 },
        equipment: { path: '/game/assets/audio/kenney-ui-audio/switch11.ogg', tracks: 1 },
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
    expect(result.musicVolume).toBeCloseTo(0.108)
    expect(result.menuOpen.duration).toBeCloseTo(0.28, 1)
    const [near, far] = result.footsteps.settings
    expect(near).toEqual([0.8, 0.96])
    expect(far?.[0]).toBeCloseTo(0.3)
    expect(far?.[1]).toBe(1)
})

test('plays one attenuated portal loop and spaces real forest cues without overlaps', async ({
    page,
}) => {
    const result = await page.evaluate(() => window.engineHarness.ambience())
    expect(result).toMatchObject({
        startedWhileMuted: 0,
        startedWithoutFreshSnapshot: 0,
        portal: {
            oneLoopForTwoPortals: true,
            closestVolume: 1,
            canceledFade: true,
            expiredWithoutSnapshot: true,
        },
        forest: {
            beforeDelay: 0,
            duringFirstCue: 1,
            beforeCooldown: 1,
            afterCooldown: 2,
            stoppedOnLeavingForest: true,
        },
        decoded: ['forest-bird-1.mp3', 'forest-bird-2.mp3', 'forest-wind.mp3', 'portal-hum.wav'],
    })
    expect(result.portal.duration).toBeCloseTo(4.5)
    expect(result.portal.near).toBeGreaterThan(0.9)
    expect(result.portal.far).toBeLessThan(0.16)
    expect(result.portal.far).toBeGreaterThan(0.09)
})

test('keeps forced silent sessions from loading or playing eligible world ambience', async ({
    page,
}) => {
    await page.goto('/e2e/engine/?test=1')
    await page.getByRole('button', { name: 'Enable engine audio' }).click()
    await expect(page.evaluate(() => window.engineHarness.silentAmbience())).resolves.toEqual({
        requests: 0,
        tracks: 0,
    })
    await expect(page.evaluate(() => window.engineHarness.castAndWaterAudio())).resolves.toEqual({
        requests: 0,
        sounds: 0,
    })
})

test('decodes cast, prayer and death voices and the shoreline loop', async ({ page }) => {
    const result = await page.evaluate(() => window.engineHarness.castAndWaterAudio())
    expect(result).toMatchObject({
        requests: 4,
        playing: [1, 1, 1],
        waterLoop: true,
        stoppedOnMute: true,
        stalePrayerStopped: true,
        deathVoiceSurvivesInvalidation: true,
        durations: [
            expect.closeTo(1.09, 1),
            expect.closeTo(2.42, 1),
            expect.closeTo(8, 2),
            expect.closeTo(0.82, 1),
        ],
    })
})

test('loops the real forest battle soundtrack and resumes default music when the opponent dies', async ({
    page,
}) => {
    const result = await page.evaluate(() => window.engineHarness.battleMusic())
    expect(result).toMatchObject({
        beforeFight: 1,
        whileLoading: 1,
        duringFight: { pausedDefault: true, defaultPlaying: 0, battlePlaying: 1, loop: true },
        afterFight: { battleStopped: true, resumedDefault: true, defaultPlaying: 1 },
    })
    expect(result.duration).toBeCloseTo(177.76, 0)
})

test('resumes a suspended audio context from a trusted gesture and plays the latest portal', async ({
    page,
}) => {
    const unlock = page.getByRole('button', { name: 'Enable engine audio' })
    const clickWhenReady = async () => {
        await expect(unlock).toHaveAttribute('data-waiting-for-gesture', 'true')
        await unlock.click()
    }
    const [result] = await Promise.all([
        page.evaluate(() => window.engineHarness.gestureAmbience()),
        clickWhenReady(),
    ])
    expect(result.before).toEqual({ state: 'suspended', tracks: 0 })
    expect(result.after).toEqual({ state: 'running', tracks: 1 })
    expect(result.volume).toBeCloseTo(1 / 9)
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
