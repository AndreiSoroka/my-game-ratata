import { expect, type Locator, test } from '@playwright/test'

import { readyUiStory } from './ui-story-ready'

const storyId = 'game-player-hud'
const resourceNames = ['Health', 'Mana', 'Energy'] as const
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
    ...[1280, 390, 320].flatMap((width) =>
        ['faith-known', 'faith-unknown-mood', 'wanted'].map((story) => ({ story, width }))
    ),
].map((state) => ({
    ...state,
    nickname: state.story === 'long-name' ? 'МихаилСорокаНовгородский' : 'Андрей Сорока',
    numbers: state.story === 'authorized-numbers' ? ['18/30', '40/40', '102/150'] : [],
    extended: ['faith-known', 'faith-unknown-mood', 'wanted'].includes(state.story),
    effectRows: state.story === 'wanted' ? 3 : 0,
    emptyEffectsMessages: state.story === 'wanted' ? 0 : 1,
    hudWidth: state.width <= 740 ? '150px' : '300px',
}))

for (const {
    story,
    width,
    nickname,
    numbers,
    extended,
    effectRows,
    emptyEffectsMessages,
    hudWidth,
} of states) {
    test(`production player status ${story} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(`/iframe.html?id=${storyId}--${story}&viewMode=story`)
        const panel = page.getByRole('region', { name: 'Player status' })
        await expect(panel).toBeVisible()
        await readyUiStory(page)
        await expectHudFrame(panel)
        await expect(panel).toHaveCSS('width', hudWidth)
        const effects = page.getByRole('region', { name: 'Player effects' })
        await expect(effects).toBeVisible()
        await expect(effects.locator('[data-player-effect]')).toHaveCount(effectRows)
        await expect(effects.getByText('Всё в порядке', { exact: true })).toHaveCount(
            emptyEffectsMessages
        )
        await expect(panel.locator('[data-player-effect]')).toHaveCount(0)
        await expect(panel.locator('.player-status__layout')).toHaveCSS('row-gap', '12px')
        await expect(panel.locator('.player-status__resources')).toHaveCSS('row-gap', '10px')
        await expect(panel.locator('.player-status__header [role="img"]')).toHaveCount(2)
        await expect(panel).not.toContainText('Connected')
        await expect(panel.locator('.player-status__header')).toHaveCSS(
            'background-color',
            'rgba(0, 0, 0, 0)'
        )
        const ornaments = panel.locator('[data-fantasy-divider="divider-005"]')
        await expect(ornaments).toHaveCount(2)
        await expect(ornaments.first()).toHaveAttribute('data-fantasy-divider-ends', 'right')
        await expect(ornaments.last()).toHaveAttribute('data-fantasy-divider-ends', 'left')
        for (const ornament of await ornaments.all()) {
            await expect(ornament).toBeVisible()
            await expect(ornament).toHaveAttribute('data-fantasy-divider-fade', 'true')
            await expect(ornament).toHaveAttribute('aria-hidden', 'true')
        }
        const heading = panel.getByRole('heading')
        await expect(heading).toHaveAttribute('title', nickname)
        await expect(heading).toHaveCSS('font-family', /Pixelify Sans/)
        await expect(heading).toHaveCSS('text-overflow', 'ellipsis')
        await assertStatusDetails(panel, extended, story === 'faith-known' || story === 'wanted')
        await assertResourceBars(panel, percentagesByStory[story] ?? defaultPercentages, numbers)
        await assertPanelGeometry(panel, extended, story === 'long-name')
        await expect(page.locator('.game-player-status')).toHaveScreenshot(
            `player-status-${story}-${width}.png`,
            { animations: 'disabled', maxDiffPixels: 0 }
        )
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
    await expect(health).toHaveCSS('animation-name', /player-status-bar-blink/)
    for (const bar of [mana, energy]) {
        await expect(bar).toHaveCSS('opacity', '0.92')
        await expect(bar).toHaveCSS('animation-name', 'none')
    }

    await page.goto(`/iframe.html?id=${storyId}--low-resources&viewMode=story`)
    for (const bar of [health, mana, energy]) {
        await expect(bar).toHaveCSS('animation-name', /player-status-bar-blink/)
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
        await page.goto(`/iframe.html?id=entities-character-patron-mood--${state}&viewMode=story`)
        const mood = page.getByRole('img', { name: label })
        await expect(mood).toHaveAttribute('title', label)
        await expect(mood).toHaveText('')
        await expect(mood.locator('svg[aria-hidden="true"]')).toBeVisible()
        await expect(mood).toHaveCSS('color', color)
        await readyUiStory(page)
        await expect(mood).toHaveScreenshot(`patron-mood-${state}.png`, { maxDiffPixels: 0 })
    })
}

test('extended HUD republishes its occupied height after a viewport resize', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 844 })
    await page.goto(`/iframe.html?id=${storyId}--wanted&viewMode=story`)
    const panel = page.getByRole('region', { name: 'Player status' })
    await expect(panel.getByLabel('Покровитель и развитие')).toBeVisible()
    const effects = page.getByRole('region', { name: 'Player effects' })
    await expect(effects.getByRole('heading', { name: 'Статус игрока' })).toBeVisible()
    await expectHudFrame(effects)
    await expect(effects.locator('[data-player-effect]')).toHaveText([
        'Кража · 4 с',
        'Розыск · 22 с',
        'В чёрном списке Новогорода',
    ])
    await expect(panel.getByLabel('Покровитель и развитие')).toHaveCSS(
        'font-family',
        /Pixelify Sans/
    )
    await expect(effects).toHaveCSS('font-family', /Pixelify Sans/)
    await expectPublishedHeight(panel)
    await expectAlignedRows(panel)
    await page.setViewportSize({ width: 320, height: 844 })
    await expectPublishedHeight(panel)
    await expectAlignedRows(panel)
    await assertPanelGeometry(panel, true, false)
})

test('compact status list scrolls and reserves space for the adjacent overlays', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 480 })
    await page.goto(`/iframe.html?id=${storyId}--many-effects&viewMode=story`)
    const panel = page.getByRole('region', { name: 'Player status' })
    const effects = page.getByRole('region', { name: 'Player effects' })
    await expect(effects.locator('[data-player-effect="stun"]')).toHaveText(/Оглушение · 0,8 с/)
    await expect(effects.locator('[data-player-effect="barrier"]')).toHaveText(
        'Магический барьер · 5 с'
    )
    await expectPublishedHeight(panel)
    await readyUiStory(page)
    await expect(page.locator('.game-player-status')).toHaveScreenshot('many-effects-compact.png')
    const list = effects.getByRole('list')
    const dimensions = await list.evaluate((element) => {
        const height = element.clientHeight
        const scrollHeight = element.scrollHeight
        element.scrollTop = scrollHeight
        return { height, scrollHeight, scrollTop: element.scrollTop }
    })
    expect(dimensions.height).toBeGreaterThan(0)
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.height)
    expect(dimensions.scrollTop).toBeGreaterThan(0)
    const bounds = await effects.boundingBox()
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(368)
})

test('character entity controls edit fill and exact values independently', async ({ page }) => {
    await page.goto('/?path=/story/entities-character-player-status--authorized-numbers')
    const preview = page.frameLocator('#storybook-preview-iframe')
    const health = preview.getByRole('progressbar', { name: 'Health' })
    await expect(health).toHaveAttribute('aria-valuenow', '60')
    await expect(health).toHaveAttribute('aria-valuetext', '18/30')

    await page.getByRole('tab', { name: /^Controls/ }).click()
    await page.locator('#control-hpPercent').press('End')
    await expect(health).toHaveAttribute('aria-valuenow', '100')
    await expect(health).toHaveAttribute('aria-valuetext', '18/30')

    const exactHealth = page.locator('#control-hpCurrent')
    await exactHealth.fill('17')
    await exactHealth.press('Tab')
    await expect(health).toHaveAttribute('aria-valuetext', '17/30')
    await expect(health).toHaveAttribute('aria-valuenow', '100')
})

async function expectHudFrame(panel: Locator): Promise<void> {
    await expect(panel).toHaveClass(/character-hud-frame/)
    await expect(panel).toHaveAttribute('data-fantasy-panel', 'panel-028')
    await expect(panel).toHaveCSS('background-clip', 'border-box')
    await expect(panel).toHaveCSS('background-color', 'rgba(37, 44, 43, 0.92)')
    await expect(panel).toHaveCSS('outline-color', 'rgb(69, 57, 41)')
    await expect(panel).toHaveCSS('outline-width', '2px')
}

async function assertStatusDetails(
    panel: Locator,
    extended: boolean,
    showPatronMood: boolean
): Promise<void> {
    const divider = panel.locator('[data-fantasy-divider="divider-002"]')
    if (!extended) {
        await expect(divider).toHaveCount(0)
        return
    }

    await expect(divider).toBeVisible()
    await expect(divider).toHaveCSS('height', '10px')
    await expect(divider).toHaveAttribute('aria-hidden', 'true')
    await expect(divider).toHaveAttribute('data-fantasy-divider-ends', 'right')
    await expect(divider).toHaveAttribute('data-fantasy-divider-fade', 'true')
    await expect(panel.locator('.faith-status__omen')).toHaveCount(0)
    if (showPatronMood) {
        const faithTitle = panel.locator('.faith-status__title')
        await expect(faithTitle.getByRole('img', { name: 'Благосклонность' })).toBeVisible()
        await expect(faithTitle).not.toContainText('Благосклонность')
    } else {
        await expect(panel.locator('[data-patron-mood]')).toHaveCount(0)
    }
}

async function expectAlignedRows(panel: Locator): Promise<void> {
    const dimensions = await panel.evaluate((element) => {
        const stack = element.closest('.game-player-status')!
        const statuses = [
            '.faith-status__name',
            ...['theft-cooldown', 'wanted', 'blacklisted'].map(
                (kind) => `[data-player-effect="${kind}"] .player-effects__label`
            ),
        ].map((selector) => stack.querySelector(selector)!)
        const bar = element.querySelector('.player-status__bar')!
        const divider = element.querySelector('[data-fantasy-divider="divider-002"]')!
        const lefts = [bar, divider, ...statuses].map((row) => row.getBoundingClientRect().left)
        const widths = [
            '.faith-status__icon',
            '.patron-mood svg',
            '[data-player-effect="theft-cooldown"] svg',
            '[data-player-effect="blacklisted"] svg',
        ].map((selector) => stack.querySelector(selector)!.getBoundingClientRect().width)
        const fontSizes = [
            element.querySelector('.player-status__resource-label')!,
            ...statuses,
        ].map((row) => getComputedStyle(row).fontSize)
        const patron = element.querySelector('.faith-status__patron')!
        return {
            lefts,
            barRight: bar.getBoundingClientRect().right,
            dividerRight: divider.getBoundingClientRect().right,
            widths,
            fontSizes,
            compact: window.innerWidth <= 740,
            patronFits: patron.scrollWidth <= patron.clientWidth,
        }
    })
    expect(new Set(dimensions.lefts).size).toBe(1)
    expect(dimensions.dividerRight).toBe(dimensions.barRight)
    expect(new Set(dimensions.widths).size).toBe(1)
    expect(new Set(dimensions.fontSizes)).toEqual(new Set([dimensions.compact ? '9px' : '12px']))
    expect(dimensions.patronFits).toBe(true)
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
                const published = Number.parseFloat(
                    host.style.getPropertyValue('--ratata-player-status-bottom')
                )
                const actual =
                    stack.getBoundingClientRect().bottom - host.getBoundingClientRect().top + 8
                return Math.abs(published - actual) < 0.1
            })
        )
        .toBe(true)
}

async function assertPanelGeometry(
    panel: Locator,
    extended: boolean,
    expectTruncatedNickname: boolean
): Promise<void> {
    const sizes = await panel.evaluate((panel) => {
        const bounds = panel.getBoundingClientRect()
        const heading = panel.querySelector('h2')!
        const title = heading.getBoundingClientRect()
        const header = panel.querySelector('.player-status__header')!.getBoundingClientRect()
        const icons = panel.querySelector('.soul-badge')!.getBoundingClientRect()
        const [left, right] = Array.from(
            panel.querySelectorAll('.player-status__header .fantasy-divider'),
            (element) => element.getBoundingClientRect()
        )
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
            nicknameBetweenOrnaments: left!.right <= title.left && title.right <= right!.left,
            truncatedNickname: heading.scrollWidth > heading.clientWidth,
            distinctNameAndIcons:
                title.right <= icons.left ||
                icons.right <= title.left ||
                title.bottom <= icons.top ||
                icons.bottom <= title.top,
            height: bounds.height,
            compactLimit: window.innerWidth <= 740 ? 150 : 180,
            contained: [title, icons, left!, right!, ...tracks].every(
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
    expect(sizes.nicknameBetweenOrnaments).toBe(true)
    expect(sizes.truncatedNickname).toBe(expectTruncatedNickname)
    expect(sizes.distinctNameAndIcons).toBe(true)
    expect(sizes.height).toBeLessThanOrEqual(extended ? 500 : sizes.compactLimit)
    expect(sizes.contained).toBe(true)
}
