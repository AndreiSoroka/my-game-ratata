import { expect, type Locator, type Page, test } from '@playwright/test'

import { selectBuildStar } from './atlas-build-workflow'

const card = (page: Page) => page.getByTestId('selected-star-card')
const bullets = (page: Page) => card(page).locator('li')
async function inspectCard(page: Page, id: string, name: string): Promise<void> {
    await selectBuildStar(page, id)
    await expect(card(page).getByRole('heading')).toHaveText(name)
}
async function toggleBySpace(page: Page, id: string, enabled: boolean): Promise<void> {
    await selectBuildStar(page, id)
    await page.locator(`[data-star-id="${id}"]`).press('Space')
    await expect(page.getByTestId('selected-star-toggle')).toHaveAttribute(
        'aria-checked',
        String(enabled)
    )
}
async function expectPrayerBase(list: Locator): Promise<void> {
    await expect(list.filter({ hasText: 'Лечит вас или союзника.' })).toHaveCount(1)
    await expect(list.filter({ hasText: 'Очищает могилы от тёмных сил.' })).toHaveCount(1)
    await expect(list.filter({ hasText: /^Воскрешает павших/i })).toHaveCount(1)
    await expect(
        list.filter({ hasText: 'За одну молитву действует на одну выбранную цель.' })
    ).toHaveCount(1)
}
async function assertPrayerListUpdates(page: Page): Promise<void> {
    await inspectCard(page, 'prayer.root', 'Молитва')
    await expectPrayerBase(bullets(page))
    await expect(bullets(page)).toHaveCount(4)
    await expect(bullets(page).filter({ hasText: /нежит/i })).toHaveCount(0)
    await toggleBySpace(page, 'prayer.harm', true)
    await expect(card(page)).not.toContainText(/воскреш|очищает могилы|лечит вас/i)
    await inspectCard(page, 'prayer.root', 'Молитва')
    await expectPrayerBase(bullets(page))
    await expect(bullets(page).filter({ hasText: /урон.*нежит/i })).toHaveCount(1)
    await expect(bullets(page)).toHaveCount(5)
    await toggleBySpace(page, 'prayer.gift1', true)
    for (const id of ['prayer.focus', 'prayer.radius1', 'prayer.radius2', 'prayer.omen1']) {
        await toggleBySpace(page, id, true)
    }
    await expect(page.getByTestId('debug-mastery-level')).toHaveText('6')
    await toggleBySpace(page, 'prayer.harm1', true)
    await inspectCard(page, 'prayer.root', 'Молитва')
    await expect(bullets(page).filter({ hasText: /^Урон кары увеличен на 130%/ })).toHaveCount(1)
    await expect(bullets(page).filter({ hasText: /^Лечение усилено на 130%/ })).toHaveCount(1)
    await toggleBySpace(page, 'prayer.harm', false)
    await inspectCard(page, 'prayer.root', 'Молитва')
    await expect(bullets(page).filter({ hasText: /урон.*нежит|^Урон кары увеличен/i })).toHaveCount(
        0
    )
    await expect(bullets(page).filter({ hasText: /^Лечение усилено на 130%/ })).toHaveCount(1)
    await toggleBySpace(page, 'prayer.revive', false)
    await expect(page.getByTestId('debug-build-feedback')).toHaveCSS('pointer-events', 'none')
    await inspectCard(page, 'prayer.root', 'Молитва')
    await expect(bullets(page).filter({ hasText: /^Воскрешает павших/i })).toHaveCount(0)
    await toggleBySpace(page, 'prayer.revive', true)
    await inspectCard(page, 'prayer.root', 'Молитва')
    await expectPrayerBase(bullets(page))
}
for (const width of [320, 390, 1280]) {
    test(`active Prayer card lists only currently enabled features at ${width}px`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/?debug=constellations&class=cleric&seed=card-features')
        await expect(page.getByTestId('constellation-debug')).toBeVisible({ timeout: 15_000 })
        await assertPrayerListUpdates(page)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            width
        )
    })
}

test('active cards keep school and action improvements isolated', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/?debug=constellations&class=cleric&seed=card-isolation')
    await page.getByTestId('debug-build-all').click()
    await inspectCard(page, 'prayer.root', 'Молитва')
    await expect(bullets(page).filter({ hasText: /^Воскрешает павших/i })).toHaveCount(1)
    await expect(bullets(page).filter({ hasText: /урон.*нежит/i })).toHaveCount(1)
    for (const [id, name] of [
        ['prayer_road.root', 'Молитва странника'],
        ['prayer_lantern.root', 'Молитва ясности'],
    ] as const) {
        await inspectCard(page, id, name)
        expect((await bullets(page).allTextContents()).join(' ')).not.toMatch(
            /воскреш|нежит|могил/i
        )
    }
    await inspectCard(page, 'prayer_grave.root', 'Молитва праха')
    await expect(bullets(page).filter({ hasText: /Возвращает павших.*нежит/i })).toHaveCount(1)
    await toggleBySpace(page, 'prayer_grave.revive', false)
    await inspectCard(page, 'prayer_grave.root', 'Молитва праха')
    await expect(bullets(page).filter({ hasText: /Возвращает павших/i })).toHaveCount(0)
    await inspectCard(page, 'arrow.root', 'Быстрый выстрел')
    await expect(
        bullets(page).filter({ hasText: /Урон Быстрого выстрела увеличен на 25%/ })
    ).toHaveCount(1)
    await expect(
        bullets(page).filter({ hasText: /следующий Быстрый выстрел на 10% сильнее/i })
    ).toHaveCount(1)
    expect((await bullets(page).allTextContents()).join(' ')).not.toMatch(/Искр|лечени|воскреш/i)
    await inspectCard(page, 'magic.fireball', 'Огненная стрела')
    await expect(
        bullets(page).filter({
            hasText: /Урон Огненной стрелы и Большого огненного шара увеличен на 10%/,
        })
    ).toHaveCount(1)
    expect((await bullets(page).allTextContents()).join(' ')).not.toMatch(/Искр|Барьер|воскреш/i)
    await inspectCard(page, 'prayer.gift1', 'Тёплый дар')
    expect((await bullets(page).allTextContents()).join(' ')).not.toMatch(/воскреш|нежит|могил/i)
})
