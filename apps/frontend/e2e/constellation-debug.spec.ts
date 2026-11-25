import { expect, type Page, test } from '@playwright/test'

import { fullConstellationCatalog } from '../../backend/src/game/constellationNodes'
import { describeConstellationEffectChance } from '../src/pages/constellation-debug/model/constellationEffectChance'
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
    if (fullConstellationCatalog.find((node) => node.id === id)?.effectType === 'passive') {
        await expect(chance).not.toContainText('Шанс лечения')
        await expect(chance).not.toContainText(/очищени/i)
    }
    await chance.locator(':scope > summary').click()
}

async function expectKaraResult(page: Page, damage: number, chance = '75%'): Promise<void> {
    const result = buildResultPanel(page)
    await expect(result.locator(':scope > summary')).toHaveText('Кара: результат')
    await expect(result.locator('[data-metric]')).toHaveCount(1)
    await expect(result.locator('[data-metric="Шанс кары"] dd')).toHaveText(chance)
    await expect(result.locator('[data-build-metric="Урон кары"] dd')).toContainText(`${damage} HP`)
    await expect(result.locator('[data-build-metric="Лечение"]')).toHaveCount(0)
    await expect(result.locator('[data-build-metric="Цена молитвы"]')).toHaveCount(0)
    await expect(result.locator('[data-build-metric="Время молитвы"]')).toHaveCount(0)
    await expect(result.locator('[data-build-metric="Множитель кары"]')).toHaveCount(0)
    await expect(page.getByTestId('debug-last-light')).toHaveCount(0)
    await expect(result.getByTestId('debug-prayer-build-effects')).not.toContainText('Лечение')
    await expect(result.getByTestId('debug-prayer-build-effects')).not.toContainText('Очищение')
    await expect(result.getByTestId('debug-prayer-build-effects')).not.toContainText('Воскрешение')
}
async function enableInspectedStar(page: Page, id: string): Promise<void> {
    await selectBuildStar(page, id)
    await page.getByTestId('selected-star-toggle').click()
}

test('stealth and theft have separate constellations, practice and chance examples', async ({
    page,
}) => {
    await page.goto('/?debug=constellations&class=vanguard&seed=stealth-and-theft')
    const graph = page.getByRole('group', { name: 'Созвездия развития' })
    await expect(graph.locator('[data-node-id^="shadow."]')).toHaveCount(10)
    await expect(graph.locator('[data-node-id^="theft."]')).toHaveCount(10)

    await selectBuildStar(page, 'shadow.root')
    const card = page.getByTestId('selected-star-card')
    await expect(card.getByRole('heading')).toHaveText('Скрытность')
    const mastery = page.getByTestId('debug-mastery-summary')
    await mastery.locator(':scope > summary').click()
    const rewards = mastery.getByTestId('debug-mastery-reward').locator('option')
    await expect(rewards).toHaveCount(1)
    await expect(rewards.first()).toContainText('15 XP')

    await selectBuildStar(page, 'theft.root')
    await expect(card.getByRole('heading')).toHaveText('Воровство')
    await expect(rewards).toHaveCount(2)
    await expect(rewards.first()).toContainText('70 XP')
    await expect(rewards.last()).toContainText('25 XP')

    const chance = page.getByTestId('debug-effect-chance')
    await chance.locator(':scope > summary').click()
    await chance.getByText('Готовые примеры расчёта', { exact: true }).click()
    const rear = chance.getByRole('row', { name: /Со спины/ })
    await expect(rear).toContainText('Успех 35%, поимка 12%, тихий промах 53%')

    await page.getByTestId('debug-build-all').click()
    await expect(rear).toContainText('Успех 43,95%, поимка 8%, тихий промах 48,05%')
    await selectBuildStar(page, 'theft.composure3')
    await expect(card.getByRole('heading')).toHaveText('Рука в тени')
    await expect(page.locator('[data-required-path="theft"]')).toHaveAttribute('data-required', '6')
    await expect(page.locator('[data-required-path="shadow"]')).toHaveCount(0)
})

async function assertOwnPrayerModifiers(page: Page): Promise<void> {
    for (const [id, increase] of [
        ['prayer.gift1', 130],
        ['prayer.gift2', 250],
    ] as const) {
        await enableInspectedStar(page, id)
        await expect(buildResultPanel(page)).toContainText(`+${increase}%`)
        await expect(buildResultPanel(page).locator('[data-metric]')).toHaveCount(0)
        await expect(buildResultPanel(page)).not.toContainText('Шанс лечения')
    }
    for (const [id, increase] of [
        ['prayer.harm1', 130],
        ['prayer.harm2', 330],
    ] as const) {
        await enableInspectedStar(page, id)
        await expect(
            buildResultPanel(page).locator('[data-build-metric="Урон кары"] dd')
        ).toHaveText(`+${increase}%`)
        await expect(buildResultPanel(page).locator('[data-metric]')).toHaveCount(0)
        await expect(buildResultPanel(page).getByTestId('debug-prayer-mood')).toHaveCount(0)
    }
}
for (const width of [320, 390, 1280]) {
    test(`atlas isolates passive contributions and combines the active Prayer at ${width}px`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/?debug=constellations&class=cleric&seed=kara-result')
        await expect(page.getByTestId('constellation-debug')).toBeVisible()
        await setBuildPanelsOpen(page, true)
        await selectBuildStar(page, 'prayer.harm')
        await expect(page.getByTestId('debug-build-count').locator('strong')).toHaveText('2')
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
        await assertOwnPrayerModifiers(page)
        await selectBuildStar(page, 'prayer.harm')
        await expectKaraResult(page, 6)
        await page
            .getByTestId('debug-prayer-mood')
            .getByRole('button', { name: 'Благосклонность' })
            .click()
        await expectKaraResult(page, 8, '95%')
        await selectBuildStar(page, 'prayer.root')
        await expect(page.locator('[data-metric="Шанс лечения"] dd')).toHaveText('80%')
        await expect(page.locator('[data-metric="Шанс кары"] dd')).toHaveText('95%')
        await expect(page.locator('[data-build-metric="Лечение"] dd')).toHaveText('37 HP')
        await expect(page.locator('[data-build-metric="Урон кары"] dd')).toContainText('44 HP')
        await expect(
            page.getByTestId('debug-prayer-mood').getByRole('button', { name: 'Благосклонность' })
        ).toHaveAttribute('aria-pressed', 'true')
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            width
        )
    })
}
async function ownResultContent(page: Page): Promise<string[]> {
    return buildResultPanel(page).locator('dl, ul').allTextContents()
}
async function assertCatalogResult(
    page: Page,
    id: string,
    compareOtherBuild: boolean
): Promise<void> {
    const node = fullConstellationCatalog.find((entry) => entry.id === id)!
    const result = buildResultPanel(page)
    await expect(result).toHaveAttribute('data-result-node', id)
    await expect(result).toHaveAttribute('data-result-type', node.effectType)
    await expect(result.locator(':scope > summary')).toHaveText(`${node.name}: результат`)
    if (node.effectType !== 'passive' || !compareOtherBuild) return
    const before = await ownResultContent(page)
    expect(before.join('')).not.toBe('')
    const unrelated = node.constellationId.startsWith('prayer') ? 'arrow.root' : 'prayer.root'
    await page.getByTestId('debug-search').fill(unrelated)
    await page.locator(`[data-star-toggle="${unrelated}"]`).click()
    await expect(page.getByTestId('selected-star-toggle')).toHaveAttribute('aria-checked', 'true')
    expect(await ownResultContent(page)).toEqual(before)
    await page.getByTestId('debug-build-all').click()
}

async function assertOwnNonPrayerResults(page: Page): Promise<void> {
    await selectBuildStar(page, 'arrow.damage2')
    await expect(
        page.locator('[data-build-metric="Усиление урона Быстрого выстрела"] dd')
    ).toHaveText('+10%')
    await expect(
        page.locator('[data-build-metric="Итоговый множитель урона Быстрого выстрела"]')
    ).toHaveCount(0)
    await selectBuildStar(page, 'magic.runic_echo')
    await expect(
        page.locator('[data-build-metric="Усиление следующего Быстрого выстрела"] dd')
    ).toHaveText('+10%')
    await expect(page.locator('[data-build-metric="Время на Быстрый выстрел"] dd')).toHaveText(
        '5000 мс'
    )
    await expect(page.getByTestId('debug-runic-charged')).toHaveCount(0)
    await selectBuildStar(page, 'magic.fireball')
    await expect(page.locator('[data-build-metric="Урон Огненной стрелы"] dd')).toHaveText(
        '11–44 HP'
    )
    await expect(page.locator('[data-build-metric="Дальность Огненной стрелы"] dd')).toHaveText(
        '10 клеток'
    )
    await expect(page.locator('[data-build-metric="Радиус взрыва, кл."] dd')).toHaveText('4')
    await expect(page.locator('[data-build-metric="Цена заклинания, MP"] dd')).toHaveText('6')
    await expect(buildResultPanel(page).locator('dl')).not.toContainText('Искры')
    await expect(buildResultPanel(page).locator('dl')).not.toContainText('Быстрого выстрела')
}

for (const width of [320, 390, 1280]) {
    test(`mastery atlas is compact and consistent at ${width}px`, async ({ page }) => {
        test.setTimeout(180_000)
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/?debug=constellations&class=cleric&seed=mastery-atlas')
        const atlas = page.getByTestId('constellation-debug')
        await expect(atlas).toBeVisible()
        await expect(page.locator('[data-star-id]')).toHaveCount(fullConstellationCatalog.length)
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
            await assertCatalogResult(page, id, width === 1280)
        }
        await page.getByTestId('debug-search').fill('')
        await expect(page.locator('[data-star-id]')).toHaveCount(fullConstellationCatalog.length)
        await assertOwnNonPrayerResults(page)
        await selectBuildStar(page, 'arrow.root')
        await page.getByTestId('debug-mastery-summary').locator(':scope > summary').click()
        await expect(page.getByTestId('debug-mastery-rate')).toContainText('XP')
        await page.getByTestId('debug-show-summary').click()
        await expect(buildResultPanel(page)).toHaveAttribute('open', '')
        await expect(
            page.locator('[data-build-metric="Итоговый множитель урона Быстрого выстрела"] dd')
        ).toHaveText('×1,25')
        await page.getByTestId('debug-runic-charged').check()
        await expect(
            page.locator('[data-build-metric="Итоговый множитель урона Быстрого выстрела"] dd')
        ).toHaveText('×1,375')
    })
}

test('atlas compares current levels with every required path instead of claiming a star is ready', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto('/?debug=constellations&class=cleric&seed=required-current')
    await expect(page.getByTestId('constellation-debug')).toBeVisible()
    await selectBuildStar(page, 'prayer.harm1')
    const prayer = page.locator('[data-required-path="prayer"]')
    await expect(prayer).toHaveAttribute('data-required', '6')
    await expect(prayer).toHaveAttribute('data-current', '0')
    await expect(prayer).toContainText('Угольная Мать: требуется 6 · сейчас 0')
    await expect(page.getByTestId('debug-star-level-status')).toContainText('Недостаточно уровня')
    await enableInspectedStar(page, 'prayer.harm')
    await selectBuildStar(page, 'prayer.harm1')
    await expect(prayer).toHaveAttribute('data-current', '1')
    await page.getByTestId('selected-star-toggle').click()
    await expect(prayer).toHaveAttribute('data-current', '6')
    await expect(page.getByTestId('debug-star-level-status')).toHaveText(
        'Требование к уровню выполнено.'
    )
    await page.getByTestId('debug-build-reset').click()
    await enableInspectedStar(page, 'prayer.gift1')
    await selectBuildStar(page, 'prayer.last_light')
    await expect(page.locator('[data-required-path="prayer"]')).toHaveAttribute('data-current', '1')
    const life = page.locator('[data-required-path="life"]')
    await expect(life).toHaveAttribute('data-required', '1')
    await expect(life).toHaveAttribute('data-current', '0')
    await expect(page.getByTestId('debug-star-level-status')).toContainText('Недостаточно уровня')
    await enableInspectedStar(page, 'life.root')
    await enableInspectedStar(page, 'life.hp1')
    await selectBuildStar(page, 'prayer.last_light')
    await expect(life).toHaveAttribute('data-current', '1')
    await expect(page.getByTestId('debug-star-level-status')).toHaveText(
        'Требование к уровню выполнено.'
    )
})

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
    expect(sockets.filter((url) => /\/ws\b/.test(url))).toEqual([])
    expect(requests.filter((url) => /\/ws\b|\/api\/|:3000/.test(url))).toEqual([])
})

test('ordinary entry remains the player sign-in page', async ({ page }) => {
    await page.goto('/?test=1')
    await expect(page.getByTestId('constellation-debug')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible()
})
