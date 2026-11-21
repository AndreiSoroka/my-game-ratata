import { expect, type Locator, test } from '@playwright/test'

import { readyUiStory } from './ui-story-ready'

const storyId = 'game-player-hud'
const resourceNames = ['Health', 'Mana', 'Energy'] as const
const resourceHeights = [13, 10, 10] as const
const defaultPercentages = [100, 100, 100]
const percentagesByStory: Record<string, number[]> = {
    'empty-resources': [0, 0, 0],
    'low-health': [25, 100, 100],
    'low-resources': [3, 5, 5],
    'authorized-numbers': [(17.8704 / 30) * 100, (39.6 / 40) * 100, (102.4 / 150) * 100],
}

const states = [
    { story: 'normal', width: 1280 },
    { story: 'long-name', width: 1280 },
    { story: 'long-name', width: 390 },
    { story: 'long-name', width: 320 },
    { story: 'empty-resources', width: 390 },
    { story: 'low-resources', width: 320 },
    { story: 'low-health', width: 1280 },
    { story: 'scripted-echo', width: 320 },
    { story: 'authorized-numbers', width: 1280 },
    { story: 'authorized-numbers', width: 320 },
    { story: 'active-effects', width: 1280 },
    { story: 'active-effects', width: 390 },
    ...[1280, 390, 320].flatMap((width) =>
        ['faith-known', 'faith-unknown-mood', 'wanted'].map((story) => ({ story, width }))
    ),
].map((state) => ({
    ...state,
    nickname: state.story === 'long-name' ? 'МихаилСорокаНовгородский' : 'Андрей Сорока',
    numbers: state.story === 'authorized-numbers' ? ['18/30', '40/40', '102/150'] : [],
    extended: ['faith-known', 'faith-unknown-mood', 'wanted', 'active-effects'].includes(
        state.story
    ),
    effectCount: state.story === 'active-effects' ? 5 : state.story === 'wanted' ? 3 : 0,
    hudWidth: state.width <= 740 ? '150px' : '220px',
}))

for (const { story, width, nickname, numbers, extended, effectCount, hudWidth } of states) {
    test(`production player HUD ${story} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(`/iframe.html?id=${storyId}--${story}&viewMode=story`)
        const hud = page.locator('.game-player-status')
        const frame = hud.locator('.hud-frame')
        const panel = frame.getByRole('region', { name: 'Player vitals' })
        await expect(panel).toBeVisible()
        await readyUiStory(page)
        await expectHudFrame(frame)
        await expect(frame).toHaveCSS('width', hudWidth)
        const strip = hud.locator('.player-effects-strip')
        const effects = strip.getByRole('list', { name: 'Player effects' })
        await expect(effects).toHaveCount(effectCount ? 1 : 0)
        await expect(effects.getByRole('button')).toHaveCount(effectCount)
        await expect(effects.locator('[data-player-effect][aria-expanded="false"]')).toHaveCount(
            effectCount
        )
        await expect(strip.locator('[data-player-effect-detail]')).toHaveCount(0)
        await expect(frame.locator('[data-player-effect]')).toHaveCount(0)
        await expect(panel.locator('.faith-status-list')).toHaveCount(0)
        await expect(hud.getByText('Всё в порядке', { exact: true })).toHaveCount(0)
        await expect(panel.locator('.player-vitals__layout')).toHaveCSS('row-gap', '4px')
        await expect(panel.locator('.player-vitals__resources')).toHaveCSS('row-gap', '3px')
        const identity = frame.locator('.soul-badge-icons')
        const isEcho = story === 'scripted-echo'
        await expect(identity.getByRole('img')).toHaveCount(2)
        await expect(identity.getByRole('img', { name: isEcho ? 'Эхо' : 'Искра' })).toBeVisible()
        await expect(
            identity.getByRole('img', { name: isEcho ? 'Без речи' : 'Есть речь' })
        ).toBeVisible()
        await expect(panel).not.toContainText('Connected')
        await expect(panel.locator('.player-vitals__header')).toHaveCSS(
            'background-color',
            'rgba(0, 0, 0, 0)'
        )
        await expect(panel.locator('[data-fantasy-divider="divider-005"]')).toHaveCount(0)
        const heading = panel.getByRole('heading')
        await expect(heading).toHaveAttribute('title', nickname)
        await expect(heading).toHaveCSS('font-family', /Pixelify Sans/)
        await expect(heading).toHaveCSS('white-space', 'nowrap')
        await expect(heading).toHaveCSS('text-overflow', 'ellipsis')
        await assertFaithDetails(frame, extended, extended && story !== 'faith-unknown-mood')
        await assertResourceBars(panel, percentagesByStory[story] ?? defaultPercentages, numbers)
        await assertPanelGeometry(panel, story === 'long-name' && width <= 740)
        expect((await frame.boundingBox())!.height).toBeLessThanOrEqual(extended ? 844 : 132)
        await expect(hud).toHaveScreenshot(`player-status-${story}-${width}.png`, {
            animations: 'disabled',
            maxDiffPixels: 0,
        })
    })
}

test('low resources pulse independently and only low health dims the other bars', async ({
    page,
}) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(`/iframe.html?id=${storyId}--low-health&viewMode=story`)
    const health = page.getByRole('progressbar', { name: 'Health' })
    const mana = page.getByRole('progressbar', { name: 'Mana' })
    const energy = page.getByRole('progressbar', { name: 'Energy' })
    await expect(health).toHaveAttribute('aria-valuenow', '25')
    await expect(health).toHaveCSS('animation-name', /player-vitals-bar-blink/)
    for (const bar of [mana, energy]) {
        await expect(bar).toHaveCSS('opacity', '0.92')
        await expect(bar).toHaveCSS('animation-name', 'none')
    }

    await page.goto(`/iframe.html?id=${storyId}--low-resources&viewMode=story`)
    for (const bar of [health, mana, energy]) {
        await expect(bar).toHaveCSS('animation-name', /player-vitals-bar-blink/)
        await expect(bar).toHaveAttribute('data-dimmed', 'false')
    }

    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const bar of [health, mana, energy]) {
        await expect(bar).toHaveCSS('animation-name', 'none')
    }
})

const patronMoods = [
    { state: 'benevolent', label: 'Благосклонность', color: 'rgb(72, 107, 70)' },
    { state: 'neutral', label: 'Спокойствие', color: 'rgb(93, 80, 55)' },
    { state: 'wrathful', label: 'Гнев', color: 'rgb(158, 62, 44)' },
]

for (const { state, label, color } of patronMoods) {
    test(`patron mood ${state} shows its icon and tone`, async ({ page }) => {
        await page.goto(
            `/iframe.html?id=entities-player-effects-patronmood--${state}&viewMode=story`
        )
        const mood = page.getByRole('img', { name: label })
        await expect(mood).toHaveAttribute('title', label)
        await expect(mood).toHaveText('')
        await expect(mood.locator('svg[aria-hidden="true"]')).toBeVisible()
        await expect(mood).toHaveCSS('color', color)
        await readyUiStory(page)
        await expect(mood).toHaveScreenshot(`patron-mood-${state}.png`, { maxDiffPixels: 0 })
    })
}

for (const width of [1280, 320]) {
    test(`earned prayer details fit the player HUD at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(`/iframe.html?id=${storyId}--faith-precise&viewMode=story`)
        const hud = page.locator('.game-player-status')
        const frame = hud.locator('.hud-frame')
        const faith = frame.getByLabel('Покровитель и развитие')
        const chances = faith.locator('.faith-status__chances')
        await expect(chances).toContainText(/Шанс лечения\s*55%/)
        await expect(chances).toContainText(/Шанс очищения могилы\s*20% за шаг/)
        await expect(chances).toContainText(/Шанс воскрешения\s*55%/)
        const timer = faith.locator('.faith-status__timer')
        const mood = faith.getByRole('img', { name: 'Спокойствие' })
        await expect(timer).toHaveText('12 с')
        await expect(mood).toBeVisible()
        await readyUiStory(page)

        const timerBounds = (await timer.boundingBox())!
        expect(timerBounds.x + timerBounds.width).toBeLessThanOrEqual((await mood.boundingBox())!.x)
        const frameBounds = (await frame.boundingBox())!
        const chancesBounds = (await chances.boundingBox())!
        expect(chancesBounds.x).toBeGreaterThanOrEqual(frameBounds.x)
        expect(chancesBounds.x + chancesBounds.width).toBeLessThanOrEqual(
            frameBounds.x + frameBounds.width
        )
        const overflow = await chances.evaluate(
            (element) => element.scrollWidth > element.clientWidth
        )
        expect(overflow).toBe(false)
        await expectPublishedHeight(frame.getByRole('region', { name: 'Player vitals' }))
        await expect(hud).toHaveScreenshot(`player-status-faith-precise-${width}.png`, {
            animations: 'disabled',
            maxDiffPixels: 0,
        })
    })
}

test('each effect discloses its details and republishes the HUD height after resizing', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1280, height: 844 })
    await page.goto(`/iframe.html?id=${storyId}--wanted&viewMode=story`)
    const hud = page.locator('.game-player-status')
    const frame = hud.locator('.hud-frame')
    const panel = frame.getByRole('region', { name: 'Player vitals' })
    const faith = frame.locator('.faith-status-list').getByLabel('Покровитель и развитие')
    await expect(faith).toBeVisible()
    const strip = hud.locator('.player-effects-strip')
    const effects = strip.getByRole('list', { name: 'Player effects' })
    const theft = effects.getByRole('button', { name: 'Кража · 4 с', exact: true })
    const wanted = effects.getByRole('button', { name: 'Розыск · 22 с', exact: true })
    const blacklisted = effects.getByRole('button', {
        name: 'В чёрном списке Новогорода',
        exact: true,
    })
    const detail = strip.locator('[data-player-effect-detail]')
    await expect(theft).toHaveAttribute('data-player-effect', 'theft-cooldown')
    await expect(wanted).toHaveAttribute('data-player-effect', 'wanted')
    await expect(blacklisted).toHaveAttribute('data-player-effect', 'blacklisted')
    await expect(effects.getByRole('button')).toHaveCount(3)
    await expect(effects.locator('[data-player-effect][aria-expanded="false"]')).toHaveCount(3)
    await expect(detail).toHaveCount(0)
    await assertStripAlignment(frame, strip, 1280)
    await expectPublishedHeight(panel)

    await theft.press('Enter')
    await expect(theft).toHaveAttribute('aria-expanded', 'true')
    await expect(detail).toHaveCount(1)
    await expect(detail).toHaveText('Кража · 4 с')
    await expect(theft).toHaveAttribute('aria-controls', await detail.evaluate((node) => node.id))

    await wanted.click()
    await expect(theft).toHaveAttribute('aria-expanded', 'false')
    await expect(wanted).toHaveAttribute('aria-expanded', 'true')
    await expect(blacklisted).toHaveAttribute('aria-expanded', 'false')
    await expect(detail).toHaveCount(1)
    await expect(detail).toHaveText('Розыск · 22 с')
    await expect(faith).toHaveCSS('font-family', /Pixelify Sans/)
    await expectPublishedHeight(panel)

    await page.setViewportSize({ width: 320, height: 844 })
    await expect(wanted).toHaveAttribute('aria-expanded', 'true')
    await expect(detail).toBeVisible()
    await assertStripAlignment(frame, strip, 320)
    await expectPublishedHeight(panel)
    await assertPanelGeometry(panel, false)

    await wanted.click()
    await expect(wanted).toHaveAttribute('aria-expanded', 'false')
    await expect(detail).toHaveCount(0)
    await expectPublishedHeight(panel)
})

test('the compact effect strip wraps and reserves space for adjacent overlays', async ({
    page,
}) => {
    const width = 320
    const height = 420
    await page.setViewportSize({ width, height })
    await page.goto(`/iframe.html?id=${storyId}--many-effects&viewMode=story`)
    const hud = page.locator('.game-player-status')
    const frame = hud.locator('.hud-frame')
    const panel = frame.getByRole('region', { name: 'Player vitals' })
    const strip = hud.locator('.player-effects-strip')
    const effects = strip.getByRole('list', { name: 'Player effects' })
    await expect(effects.getByRole('button')).toHaveCount(10)
    await assertStripAlignment(frame, strip, width)
    const layout = await effects.evaluate((list) => {
        const bounds = list.getBoundingClientRect()
        const buttons = Array.from(list.querySelectorAll('button'), (button) =>
            button.getBoundingClientRect()
        )
        return {
            rows: new Set(buttons.map(({ top }) => Math.round(top))).size,
            contained: buttons.every(
                ({ left, right }) => left >= bounds.left && right <= bounds.right
            ),
        }
    })
    expect(layout.rows).toBeGreaterThan(1)
    expect(layout.contained).toBe(true)

    const stun = effects.getByRole('button', { name: /Оглушение/ })
    const barrier = effects.getByRole('button', { name: /Магический барьер/ })
    const detail = strip.locator('[data-player-effect-detail]')
    await stun.click()
    await expect(detail).toContainText('0,8 с')
    await barrier.click()
    await expect(detail).toHaveCount(1)
    await expect(detail).toContainText('Магический барьер')
    await expect(detail).toContainText('5 с')
    await expectPublishedHeight(panel)
    await readyUiStory(page)
    await expect(hud).toHaveScreenshot('many-effects-compact.png')
    const bounds = (await hud.boundingBox())!
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height - 112)
})

test('player vitals widget mounts directly in compact mode and responds to Controls', async ({
    page,
}) => {
    await page.goto(
        '/?path=/story/widgets-player-vitals-playervitalswidget--normal&globals=backgrounds.value:parchment'
    )
    const preview = page.frameLocator('#storybook-preview-iframe')
    const vitals = preview.locator('#storybook-root > div > section.player-vitals')
    await expect(preview.locator('.hud-frame')).toHaveCount(0)
    await expect(vitals).toHaveCSS('width', '220px')
    await expect(vitals.locator('[data-fantasy-divider="divider-005"]')).toHaveCount(0)
    await expect(preview.locator('.faith-status-list')).toHaveCount(0)
    await expect(preview.getByRole('region', { name: 'Player effects' })).toHaveCount(0)
    await assertResourceBars(vitals, defaultPercentages, [])

    await page.getByRole('tab', { name: /^Controls/ }).click()
    await page.locator('#control-hpPercent').press('Home')
    const health = vitals.getByRole('progressbar', { name: 'Health' })
    await expect(health).toHaveAttribute('aria-valuenow', '0')
    await expect(health).toHaveAttribute('data-animated', 'true')
})

test('player vitals entity mounts directly and edits fill and exact values independently', async ({
    page,
}) => {
    await page.goto('/?path=/story/entities-player-vitals-playervitalsview--authorized-numbers')
    const preview = page.frameLocator('#storybook-preview-iframe')
    const frame = preview.locator('.hud-frame')
    const vitals = preview.locator('#storybook-root > div > section.player-vitals')
    await expect(vitals).toHaveCSS('width', '220px')
    await expect(frame).toHaveCount(0)
    await expect(vitals.locator('[data-fantasy-divider="divider-005"]')).toHaveCount(0)
    await assertResourceBars(vitals, [60, 25, 82], ['18/30', '10/40', '123/150'])
    const health = vitals.getByRole('progressbar', { name: 'Health' })

    await page.getByRole('tab', { name: /^Controls/ }).click()
    const firstControl = page.getByRole('tabpanel').locator('tbody tr').first()
    await expect(firstControl.getByText('compact', { exact: true })).toBeVisible()
    const compact = firstControl.getByRole('switch', { name: 'compact' })
    await expect(compact).toBeChecked()
    await page.locator('#control-hpPercent').press('End')
    await expect(health).toHaveAttribute('aria-valuenow', '100')
    await expect(health).toHaveAttribute('aria-valuetext', '18/30')

    const exactHealth = page.locator('#control-hpCurrent')
    await exactHealth.fill('17')
    await exactHealth.press('Tab')
    await expect(health).toHaveAttribute('aria-valuetext', '17/30')
    await expect(health).toHaveAttribute('aria-valuenow', '100')

    await compact.press('Space')
    await expect(compact).not.toBeChecked()
    await expect(vitals).toHaveCSS('width', '330px')
    await expect(frame).toHaveCount(0)
    await expect(vitals.locator('[data-fantasy-divider="divider-005"]')).toHaveCount(2)
    await expect(health.locator('.bar-track')).toHaveCSS('height', '18px')

    await compact.press('Space')
    await expect(compact).toBeChecked()
    await expect(vitals).toHaveCSS('width', '220px')
    await expect(frame).toHaveCount(0)
    await expect(vitals.locator('[data-fantasy-divider="divider-005"]')).toHaveCount(0)
})

async function expectHudFrame(panel: Locator): Promise<void> {
    await expect(panel).toHaveCount(1)
    await expect(panel).toHaveCSS('padding', '7px')
    await expect(panel).toHaveCSS('background-image', /^linear-gradient\(155deg,/)
    const border = panel.locator(':scope > [data-fantasy-border="border-017"]')
    await expect(border).toHaveCSS('border-top-width', '16px')
    await expect(border.locator('feFlood[result="border-color"]')).toHaveCSS(
        'flood-color',
        'rgb(198, 184, 155)'
    )
    await expect(panel).toHaveCSS('outline-style', 'none')
}

async function assertFaithDetails(
    frame: Locator,
    extended: boolean,
    showPatronMood: boolean
): Promise<void> {
    const faith = frame.locator('.faith-status-list')
    const divider = frame.locator('[data-fantasy-divider="divider-002"]')
    if (!extended) {
        await expect(faith).toHaveCount(0)
        await expect(divider).toHaveCount(0)
        return
    }

    await expect(faith).toBeVisible()
    await expect(
        frame.locator(':scope > .hud-frame__border > .player-vitals + .faith-status-list')
    ).toHaveCount(1)
    await expect(faith).toHaveCSS('margin-block-start', '4px')
    await expect(faith).toHaveCSS('row-gap', '3px')
    await expect(divider).toBeVisible()
    await expect(divider).toHaveCSS('height', '4px')
    await expect(divider).toHaveAttribute('aria-hidden', 'true')
    await expect(divider).toHaveAttribute('data-fantasy-divider-ends', 'right')
    await expect(divider).toHaveAttribute('data-fantasy-divider-fade', 'true')
    await expect(faith.locator('.faith-status__omen')).toHaveCount(0)
    if (showPatronMood) {
        const faithTitle = faith.locator('.faith-status__title')
        await expect(faithTitle.getByRole('img', { name: 'Благосклонность' })).toBeVisible()
        await expect(faithTitle).not.toContainText('Благосклонность')
    } else {
        await expect(faith.locator('[data-patron-mood]')).toHaveCount(0)
    }
}

async function assertResourceBars(
    panel: Locator,
    percentages: number[],
    numbers: string[]
): Promise<void> {
    await expect(panel.getByRole('progressbar')).toHaveCount(resourceNames.length)
    for (const [index, name] of resourceNames.entries()) {
        const bar = panel.getByRole('progressbar', { name, exact: true })
        const percent = percentages[index]!
        await expect(bar).toBeVisible()
        await expect(bar.locator('.bar-track')).toHaveCSS('height', `${resourceHeights[index]}px`)
        await expect(bar).toHaveAttribute('aria-valuemin', '0')
        await expect(bar).toHaveAttribute('aria-valuemax', '100')
        const text = bar.locator('.game-bar__label')
        const number = numbers[index]
        if (number) {
            await expect(text).toHaveText(number)
            await expect(text).toHaveCSS('font-family', /Pixelify Sans/)
            await expect(bar).toHaveAttribute('aria-valuetext', number)
        } else {
            await expect(text).toHaveCount(0)
            await expect(bar).not.toHaveAttribute('aria-valuetext', /.*/)
        }
        const geometry = await bar.evaluate((element) => {
            const content = element.querySelector('.bar-track__content')!
            const fill = content.querySelector('.game-bar__fill')!
            return {
                value: Number(element.getAttribute('aria-valuenow')),
                fillWidth: fill.getBoundingClientRect().width,
                contentWidth: content.getBoundingClientRect().width,
            }
        })
        expect(geometry.value).toBeCloseTo(percent, 8)
        expect(geometry.contentWidth).toBeGreaterThan(0)
        expect(geometry.fillWidth).toBeCloseTo((geometry.contentWidth * percent) / 100, 1)
    }
}

async function expectPublishedHeight(panel: Locator): Promise<void> {
    await expect
        .poll(() =>
            panel.evaluate((panel) => {
                const host = panel.closest<HTMLElement>('.game-screen')!
                const stack = panel.closest<HTMLElement>('.game-player-status')!
                const frame = stack.querySelector('.hud-frame')!
                const strip = stack.querySelector('.player-effects-strip')
                const published = Number.parseFloat(
                    host.style.getPropertyValue('--ratata-player-status-bottom')
                )
                const bottom = Math.max(
                    frame.getBoundingClientRect().bottom,
                    strip?.getBoundingClientRect().bottom ?? 0
                )
                const actual = bottom - host.getBoundingClientRect().top + 8
                return Math.abs(published - actual) < 0.1
            })
        )
        .toBe(true)
}

async function assertStripAlignment(frame: Locator, strip: Locator, width: number): Promise<void> {
    await expect(strip).toBeVisible()
    const frameBounds = (await frame.boundingBox())!
    const stripBounds = (await strip.boundingBox())!
    const stripRight = stripBounds.x + stripBounds.width
    expect(stripBounds.x).toBeGreaterThanOrEqual(0)
    expect(stripRight).toBeLessThanOrEqual(width)
    if (width <= 740) {
        expect(stripBounds.y).toBeGreaterThanOrEqual(frameBounds.y + frameBounds.height)
        expect(stripRight).toBeCloseTo(frameBounds.x + frameBounds.width, 1)
    } else {
        expect(stripRight).toBeLessThanOrEqual(frameBounds.x)
        expect(stripBounds.y).toBeCloseTo(frameBounds.y, 1)
    }
}

async function assertPanelGeometry(
    panel: Locator,
    expectTruncatedNickname: boolean
): Promise<void> {
    const sizes = await panel.evaluate((panel) => {
        const bounds = panel.getBoundingClientRect()
        const heading = panel.querySelector('h2')!
        const title = heading.getBoundingClientRect()
        const header = panel.querySelector('.player-vitals__header')!.getBoundingClientRect()
        const tracks = Array.from(panel.querySelectorAll('.game-bar'), (element) =>
            element.getBoundingClientRect()
        )
        return {
            left: bounds.left,
            right: bounds.right,
            viewport: window.innerWidth,
            overflow: document.documentElement.scrollWidth > window.innerWidth,
            centeredNickname:
                Math.abs((title.left + title.right) / 2 - (header.left + header.right) / 2) < 1,
            truncatedNickname: heading.scrollWidth > heading.clientWidth,
            contained: [title, ...tracks].every(
                (rect) =>
                    rect.left >= bounds.left &&
                    rect.right <= bounds.right &&
                    rect.top >= bounds.top &&
                    rect.bottom <= bounds.bottom
            ),
        }
    })
    expect(sizes.left).toBeGreaterThanOrEqual(0)
    expect(sizes.right).toBeLessThanOrEqual(sizes.viewport)
    expect(sizes.overflow).toBe(false)
    expect(sizes.centeredNickname).toBe(true)
    if (expectTruncatedNickname) expect(sizes.truncatedNickname).toBe(true)
    expect(sizes.contained).toBe(true)
}
