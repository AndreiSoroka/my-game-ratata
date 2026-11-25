import { expect, test } from '@playwright/test'

import type {} from './harness'

const webgl2 = { webgl2: true, lost: false, lostEvents: 0, preserve: false }
const animatedShoreColors = [
    [80, 54, 37],
    [33, 17, 13],
]
const northBankShadow = [66, 91, 158]
const flatWater = [77, 138, 179]
const animatedNorthBankColors = [northBankShadow, flatWater]

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

test('renders Ash curse flight and impact only where the authoritative effect is visible', async ({
    page,
}) => {
    const result = await page.evaluate(() => window.engineHarness.ashExhaustion())
    expect(result).toMatchObject({
        ...webgl2,
        noTrail: true,
        noFlightTailOnImpact: true,
        hidden: true,
        expired: true,
    })
    expect(result.start).toBeGreaterThan(60)
    expect(result.moved).toBeGreaterThan(60)
    expect(result.impact).toBeGreaterThan(10)
})

test('renders dungeon darkness, moving lantern light and wall shadows in WebGL2', async ({
    page,
}) => {
    const result = await page.evaluate(() => window.engineHarness.dungeon())
    expect(result).toMatchObject({
        ...webgl2,
        surface: { ground: [255, 255, 255], marker: [255, 0, 0] },
    })
    expect(Math.max(...result.dark.distance)).toBeLessThan(15)
    expect(Math.max(...result.dark.feet)).toBeGreaterThan(30)
    expect(Math.max(...result.dark.feet)).toBeLessThan(90)
    expect(Math.min(...result.lantern.feet)).toBeGreaterThan(220)
    expect(Math.max(...result.lantern.hiddenMarker)).toBeLessThan(15)
    expect(Math.min(...result.moved.feet)).toBeGreaterThan(220)
    expect(Math.max(...result.moved.old)).toBeLessThan(210)
    expect(Math.min(...result.torches.visible)).toBeGreaterThan(220)
    expect(Math.max(...result.torches.hiddenMarker)).toBeLessThan(15)
    expect(result.openedMarker[0]).toBeGreaterThan(120)
    expect(result.portal.lit[2]).toBeGreaterThan(120)
    expect(result.portal.lit[2]).toBeGreaterThan(result.portal.lit[0]!)
    expect(Math.max(...result.portal.expired)).toBeLessThan(15)
})

test('animates the shoreline of shipped ponds and lakes in WebGL2', async ({ page }) => {
    const result = await page.evaluate(() => window.engineHarness.water())
    expect(result).toMatchObject({
        ...webgl2,
        fractional: { outsideShoreline: 0, shore: animatedShoreColors },
        dry: { oldActorRemoved: true, hasWaterOverlay: false, differentPixels: 0 },
    })
    expect(result.fractional.animatedStrongPixels).toBeGreaterThan(
        result.fractional.expectedStrongPixels * 0.75
    )
    expect(result.pond.northBank).toEqual(animatedNorthBankColors)
    expect(result.lake.northBank).toEqual([flatWater, northBankShadow])
    expect(result.narrow).toEqual({
        northBank: [
            [117, 83, 56],
            [117, 83, 56],
        ],
        water: animatedNorthBankColors,
        southBank: [
            [80, 155, 102],
            [80, 155, 102],
        ],
        transition: [flatWater, northBankShadow],
    })
    for (const basin of [result.pond, result.lake]) {
        expect(basin.shore).toEqual(animatedShoreColors)
        expect(basin.insideCorner).toEqual(animatedShoreColors)
        expect(basin.insideCornerShadow).toEqual([flatWater, northBankShadow])
        expect(basin.center[0]).toEqual(basin.center[1])
        expect(basin.land[0]).toEqual(basin.land[1])
        expect(basin.loopDifferentPixels).toBe(0)
        expect(basin.foreground).toEqual([255, 0, 255])
    }
})

test('keeps the shore static after an atlas failure and retries when revisiting', async ({
    page,
}) => {
    let attempts = 0
    await page.route(/\/water4\.png(?:\?|$)/, async (route) => {
        attempts++
        if (attempts === 1) {
            await route.fulfill({ status: 503 })
        } else {
            await route.continue()
        }
    })
    const result = await page.evaluate(() => window.engineHarness.waterFallback())
    expect(result).toEqual({
        failedFrames: 1,
        staticDifferentPixels: 0,
        hadOverlay: false,
        staticNorthBank: northBankShadow,
        retriedShore: animatedShoreColors,
        retriedNorthBank: animatedNorthBankColors,
    })
    expect(attempts).toBe(2)
})

test('holds the still shoreline when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const result = await page.evaluate(() => window.engineHarness.waterReducedMotion())
    expect(result).toEqual({ differentPixels: 0, northBank: northBankShadow })
})

test('plays isolated real tracks and restores one music track when visible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 750 })
    const result = await page.evaluate(() => window.engineHarness.audio())
    expect(result).toMatchObject({
        audioBeforeLoad: 'running',
        forcedMute: false,
        independentSounds: true,
        menuOpen: { path: '/game/assets/audio/kenney-rpg-audio/bookPlace1.ogg', tracks: 1 },
        bookClose: { path: '/game/assets/audio/kenney-rpg-audio/bookClose.ogg', tracks: 1 },
        slotSelect: { path: '/game/assets/audio/kenney-ui-audio/rollover2.ogg', tracks: 1 },
        equipment: { path: '/game/assets/audio/kenney-ui-audio/switch11.ogg', tracks: 1 },
        worldSounds: {
            volumes: [1, 0.25, 0.125],
            afterIgnored: 3,
            afterMute: 0,
            afterHide: 0,
            beforeTravel: 1,
            afterTravel: 0,
        },
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
    expect(result.worldSounds.bellDuration).toBeCloseTo(3.8, 1)
    expect(result.worldSounds.knockDuration).toBeCloseTo(0.38, 1)
    const [near, far] = result.footsteps.settings
    expect(near).toEqual([0.8, 0.96])
    expect(far?.[0]).toBeCloseTo(0.3)
    expect(far?.[1]).toBe(1)
})

test('plays attenuated portal and dungeon loops and spaces real forest cues without overlaps', async ({
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
        wind: {
            heldSlot: true,
            stoppedAtDeadline: true,
            startsBeforeNextCue: 0,
            nextCue: 1,
        },
        draft: {
            beforeWalking: 0,
            started: 1,
            loop: true,
            pitch: -300,
            heldDuringFade: true,
            stopped: true,
        },
        decoded: ['forest-bird-1.mp3', 'forest-bird-2.mp3', 'forest-wind.mp3', 'portal-hum.wav'],
    })
    expect(result.portal.duration).toBeCloseTo(4.5)
    expect(result.portal.near).toBeGreaterThan(0.135)
    expect(result.portal.far).toBeLessThan(0.013)
    expect(result.portal.far).toBeGreaterThan(0.01)
    expect(result.wind.duration).toBeCloseTo(6)
    expect(result.wind.volume).toBeCloseTo(0.13)
    expect(result.wind.attackRatio).toBeLessThan(0.1)
    expect(result.wind.releaseRatio).toBeLessThan(0.1)
    expect(result.wind.fadedGain).toBeLessThan(0.3)
    expect(result.draft.attackGain).toBeLessThan(0.18)
    expect(result.draft.audibleGain).toBeGreaterThan(0.045)
    expect(result.draft.audibleGain).toBeLessThan(0.06)
    expect(result.draft.fadedGain).toBeLessThan(0.12)
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

test('plays Spark, Ash curse, prayer and death cues and the shoreline loop', async ({ page }) => {
    const result = await page.evaluate(() => window.engineHarness.castAndWaterAudio())
    expect(result).toMatchObject({
        requests: 5,
        playing: [1, 1, 1],
        waterLoop: true,
        stoppedOnMute: true,
        stalePrayerStopped: true,
        noWindupBuzz: true,
        castWhispersOnce: true,
        sparkWhisperStopsAtRelease: true,
        whisperGains: [expect.closeTo(0.144, 3), expect.closeTo(0.096, 3)],
        instantOneShot: true,
        prayerOneShot: true,
        magicChannels: {
            chainsLoop: true,
            chainsSingleTrack: true,
            chainsStopped: true,
            portalLoop: true,
            portalHeldBeforeDeadline: true,
            portalStoppedAtDeadline: true,
        },
        ashCurse: {
            noFlightBeforeRelease: true,
            whisperVolume: 0.25,
            whisperOneShot: true,
            stoppedWhisperOnRelease: true,
            flightVolume: 0.25,
            flightRate: 0.72,
            sharedSampleRate: 1,
            flightCount: 1,
        },
        deathVoiceSurvivesInvalidation: true,
        durations: [
            expect.closeTo(0.2, 2),
            expect.closeTo(1.09, 1),
            expect.closeTo(2.42, 1),
            expect.closeTo(8, 2),
            expect.closeTo(0.82, 1),
        ],
    })
})

test('crossfades the battle soundtrack as enemies approach and uses location exploration themes', async ({
    page,
}) => {
    const result = await page.evaluate(() => window.engineHarness.battleMusic())
    expect(result).toMatchObject({
        cityLoop: true,
        leftCity: true,
        silentAfterLateDecode: true,
        keptExplorationTrack: true,
        beforeEnemy: 1,
        whileLoading: 1,
        nearEnemy: { pausedExploration: true, loop: true },
        returnedBeforeFade: true,
        heldAfterDeath: true,
        reusedBattle: true,
        afterRetreat: { battleStopped: true, resumedExploration: true, explorationGain: 1 },
        restartedFromProximity: true,
        tracksBeforeMute: 2,
        tracksAfterMute: 0,
        dungeonWithEnemy: { exploration: 0, battle: 1 },
        dungeonAfterRetreat: 0,
        cityAfterDungeon: { city: 1, battle: 0 },
    })
    for (const gain of [...result.fadeIn, ...result.fadingOut]) {
        expect(gain).toBeGreaterThan(0)
        expect(gain).toBeLessThan(1)
    }
    expect(result.reversed[0]).toBeLessThan(result.fadingOut[0])
    expect(result.reversed[1]).toBeGreaterThan(result.fadingOut[1])
    expect(result.battleDuration).toBeCloseTo(177.76, 0)
    expect(result.explorationDuration).toBeCloseTo(178.23, 0)
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
    expect(result.volume).toBeCloseTo(1 / 90, 5)
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
