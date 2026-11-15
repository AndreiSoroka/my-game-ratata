import { expect, type Page, test } from '@playwright/test'

import { describeConstellationEffectChance } from '../src/game/debug/constellationEffectChance'
import {
    assertBuildWorkflow,
    buildResultPanel,
    selectBuildStar,
    setBuildPanelsOpen,
} from './atlas-build-workflow'

async function assertChanceAccordion(page: Page, id: string): Promise<void> {
    const effect = describeConstellationEffectChance(id)
    const visible = !effect.deterministic && effect.formulas.length > 0
    const chance = page.getByTestId('debug-effect-chance')
    await expect(chance).toHaveCount(visible ? 1 : 0)
    if (!visible) return
    await chance.locator(':scope > summary').click()
    await expect(chance.locator('[data-testid="debug-effect-formula"]').first()).toBeVisible()
    await chance.locator(':scope > summary').click()
}

async function expectKaraResult(page: Page, damage: number): Promise<void> {
    await expect(page.locator('[data-metric]')).toHaveCount(1)
    await expect(page.locator('[data-metric="Шанс кары"] dd')).toHaveText('75%')
    await expect(page.locator('[data-build-metric="Урон кары"] dd')).toContainText(`${damage} HP`)
    await expect(page.locator('[data-build-metric="Множитель кары"]')).toBeVisible()
    await expect(page.locator('[data-build-metric="Радиус"] dd')).toHaveText('3 клетки')
    await expect(page.locator('[data-build-metric="Лечение"]')).toHaveCount(0)
    await expect(page.locator('[data-build-metric="Цена молитвы"]')).toHaveCount(0)
    await expect(page.locator('[data-build-metric="Время молитвы"]')).toHaveCount(0)
    await expect(page.getByTestId('debug-last-light')).toHaveCount(0)
    await expect(page.getByTestId('debug-prayer-build-effects')).not.toContainText('Лечение')
    await expect(page.getByTestId('debug-prayer-build-effects')).not.toContainText('Очищение')
    await expect(page.getByTestId('debug-prayer-build-effects')).not.toContainText('Воскрешение')
}

for (const width of [320, 390, 1280]) {
    test(`atlas separates Kara result from the whole Prayer at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/?debug=constellations&class=cleric&seed=kara-result')
        await expect(page.getByTestId('constellation-debug')).toBeVisible()
        await setBuildPanelsOpen(page, true)
        await selectBuildStar(page, 'prayer.harm')
        await expect(buildResultPanel(page).locator(':scope > summary')).toHaveText(
            'Кара: результат'
        )
        await expect(page.getByTestId('debug-build-count').locator('strong')).toHaveText('2')
        await expect(page.getByTestId('debug-prayer-unavailable')).toBeVisible()
        await expect(page.locator('[data-metric="Шанс кары"]')).toHaveCount(0)
        await page.getByTestId('selected-star-toggle').click()
        await expectKaraResult(page, 6)
        await selectBuildStar(page, 'prayer.root')
        await expect(buildResultPanel(page).locator(':scope > summary')).toHaveText(
            'Молитва: результат'
        )
        await expect(page.locator('[data-metric]')).toHaveCount(4)
        await expect(page.locator('[data-metric="Шанс лечения"] dd')).toHaveText('55%')
        await expect(page.locator('[data-metric="Шанс очищения могилы"] dd')).toHaveText(
            '20% за шаг'
        )
        await expect(page.locator('[data-metric="Шанс воскрешения"] dd')).toHaveText('55%')
        await expect(page.locator('[data-build-metric="Лечение"] dd')).toHaveText('6 HP')
        for (const id of ['prayer.gift1', 'prayer.gift2']) {
            await selectBuildStar(page, id)
            await page.getByTestId('selected-star-toggle').click()
        }
        await selectBuildStar(page, 'prayer.harm')
        await expectKaraResult(page, 6)
        await selectBuildStar(page, 'prayer.root')
        await expect(page.locator('[data-build-metric="Лечение"] dd')).toHaveText('7 HP')
        for (const [id, damage] of [
            ['prayer.harm1', 8],
            ['prayer.harm2', 10],
        ] as const) {
            await selectBuildStar(page, id)
            await page.getByTestId('selected-star-toggle').click()
            await expectKaraResult(page, damage)
        }
        await selectBuildStar(page, 'prayer.harm')
        await expectKaraResult(page, 10)
        await page
            .getByTestId('debug-prayer-mood')
            .getByRole('button', { name: 'Благосклонность' })
            .click()
        await expect(page.locator('[data-metric="Шанс кары"] dd')).toHaveText('95%')
        await expect(page.locator('[data-build-metric="Урон кары"] dd')).toContainText('12 HP')
        await selectBuildStar(page, 'prayer.root')
        await expect(page.locator('[data-metric="Шанс лечения"] dd')).toHaveText('80%')
        await expect(page.locator('[data-metric="Шанс кары"] dd')).toHaveText('95%')
        await expect(
            page.getByTestId('debug-prayer-mood').getByRole('button', { name: 'Благосклонность' })
        ).toHaveAttribute('aria-pressed', 'true')
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            width
        )
    })
}

for (const width of [320, 390, 1280]) {
    test(`mastery atlas is compact and consistent at ${width}px`, async ({ page }) => {
        test.setTimeout(90_000)
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/?debug=constellations&class=cleric&seed=mastery-atlas')
        const atlas = page.getByTestId('constellation-debug')
        await expect(atlas).toBeVisible()
        await expect(page.locator('[data-star-id]')).toHaveCount(77)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            width
        )
        await assertBuildWorkflow(page, width, test.info())
        await setBuildPanelsOpen(page, false)
        await selectBuildStar(page, 'arrow.root')
        expect(await buildResultPanel(page).getAttribute('open')).toBeNull()
        await selectBuildStar(page, 'prayer.root')
        expect(await buildResultPanel(page).getAttribute('open')).toBeNull()
        const initial = await page
            .locator('[data-node-id]')
            .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')))
        await page.getByTestId('debug-seed').fill('another-mastery-sky')
        await page.getByTestId('debug-apply').click()
        await expect
            .poll(() =>
                page
                    .locator('[data-node-id]')
                    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')))
            )
            .not.toEqual(initial)
        await expect(page.locator('[data-node-id="prayer.revive"]')).toHaveAttribute(
            'data-enabled',
            'true'
        )
        expect(await page.getByTestId('debug-mastery-summary').getAttribute('open')).toBeNull()
        expect(await buildResultPanel(page).getAttribute('open')).toBeNull()
        await page.getByTestId('debug-class').selectOption('vanguard')
        await expect(page.locator('[data-node-id="blade.root"]')).toHaveAttribute(
            'data-enabled',
            'true'
        )
        await page.getByTestId('debug-class').selectOption('cleric')
        await expect(page.locator('[data-node-id="prayer.revive"]')).toHaveAttribute(
            'data-enabled',
            'true'
        )
        expect(await page.getByTestId('debug-mastery-summary').getAttribute('open')).toBeNull()
        expect(await buildResultPanel(page).getAttribute('open')).toBeNull()
        await page.getByTestId('debug-build-all').click()
        const ids = await page
            .locator('[data-star-id]')
            .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-star-id')!))
        for (const id of ids) {
            await selectBuildStar(page, id)
            await expect(
                page.getByTestId('selected-star-card').getByRole('heading')
            ).not.toBeEmpty()
            await expect(page.getByTestId('debug-star-minimum')).toBeAttached()
            await expect(page.getByTestId('debug-unlock-conditions')).toBeAttached()
            await assertChanceAccordion(page, id)
        }
        await page.getByTestId('debug-search').fill('')
        await expect(page.locator('[data-star-id]')).toHaveCount(77)
        await selectBuildStar(page, 'arrow.root')
        await page.getByTestId('debug-mastery-summary').locator(':scope > summary').click()
        await expect(page.getByTestId('debug-mastery-rate')).toContainText('XP')
        await page.getByTestId('debug-show-summary').click()
        await expect(buildResultPanel(page)).toHaveAttribute('open', '')
        await expect(
            page.locator('[data-build-metric="Итоговый множитель урона Выстрела"] dd')
        ).toHaveText('×1,2')
        await page.getByTestId('debug-runic-charged').check()
        await expect(
            page.locator('[data-build-metric="Итоговый множитель урона Выстрела"] dd')
        ).toHaveText('×1,32')
    })
}

test('atlas notices pause while reading and refresh on another failed attempt', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto('/?debug=constellations&class=cleric&seed=notice-timing')
    await expect(page.getByTestId('constellation-debug')).toBeVisible()
    await page.clock.install()
    await selectBuildStar(page, 'prayer.harm2')
    const toggle = page.getByTestId('selected-star-toggle')
    await toggle.click()
    const feedback = page.getByTestId('debug-build-feedback')
    await expect(feedback).toBeVisible()
    await feedback.hover()
    await page.clock.fastForward(7_000)
    await expect(feedback).toBeVisible()
    await page.mouse.move(0, 0)
    await page.locator('[data-find-parent="prayer.harm1"]').focus()
    await page.clock.fastForward(7_000)
    await expect(feedback).toBeVisible()
    await toggle.focus()
    await page.clock.fastForward(5_000)
    await expect(feedback).toBeVisible()
    await toggle.click()
    await page.clock.fastForward(5_000)
    await expect(feedback).toBeVisible()
    await page.clock.fastForward(1_001)
    await expect(feedback).toHaveCount(0)
})

test('debug atlas never joins a player or sends gameplay requests', async ({ page }) => {
    const sockets: string[] = [],
        requests: string[] = []
    page.on('websocket', (socket) => sockets.push(socket.url()))
    page.on('request', (request) => requests.push(request.url()))
    await page.goto('/?debug=constellations&class=cleric&seed=mastery-network')
    await expect(page.getByTestId('constellation-debug')).toBeVisible()
    await page.getByTestId('debug-build-all').click()
    await selectBuildStar(page, 'prayer.root')
    await setBuildPanelsOpen(page, true)
    await page.getByTestId('debug-prayer-mood').getByRole('button', { name: 'Гнев' }).click()
    expect(sockets).toEqual([])
    expect(requests.filter((url) => /\/ws\b|\/api\/|:3000/.test(url))).toEqual([])
})

test('ordinary entry remains the player sign-in page', async ({ page }) => {
    await page.goto('/?test=1')
    await expect(page.getByTestId('constellation-debug')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Enter', exact: true })).toBeVisible()
})
