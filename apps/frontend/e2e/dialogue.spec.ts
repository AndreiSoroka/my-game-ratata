import { CITY_HERB_COLLECTOR_IDS, HERBALIST_MERCHANT_ID } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

import { joinSocial, selectSocialTarget, socialMenu } from './social-helpers'
import { enterBuilding, walkTo } from './world-navigation'
import { selectedWorldTarget } from './world-target-ui'

const merchantId = 'npc_merchant_1'
const miraId = CITY_HERB_COLLECTOR_IDS.find((id) => id !== HERBALIST_MERCHANT_ID)!

test('opens the herbalist sale directly from the interaction menu', async ({ page }) => {
    test.setTimeout(90_000)
    await joinSocial(page, 'sell-from-menu')
    await approachMerchant(page, HERBALIST_MERCHANT_ID, 'Дом травницы')
    await socialMenu(page, HERBALIST_MERCHANT_ID, /^Продать:/u)
    const market = page.getByRole('region', { name: 'Городской рынок' })
    await expect(market.getByRole('tab')).toHaveCount(1)
    const sell = market.getByRole('tab', { name: 'Продать' })
    await expect(sell).toBeFocused()
    await expect(sell).toHaveAttribute('aria-selected', 'true')
    await expect(market.getByText('Лечебные травы', { exact: true })).toBeVisible()
    await expect(market.getByText('Можно продать: 0')).toBeVisible()
})

test('opens the market on selling when Mira is asked privately and then returns to the whisper', async ({
    page,
}) => {
    test.setTimeout(90_000)
    await joinSocial(page, 'sell-from-dialogue')
    await approachMerchant(page, miraId, 'Гильдия искателей')
    await socialMenu(page, miraId, /^Шёпот:/u)
    const whisper = page.getByRole('dialog', { name: 'Шёпот: Mira' })
    const input = whisper.getByPlaceholder('Сообщение собеседнику')
    await input.fill('Хочу продать лечебные травы')
    await input.press('Enter')

    const market = page.getByRole('region', { name: 'Городской рынок' })
    const sell = market.getByRole('tab', { name: 'Продать' })
    await expect(sell).toHaveAttribute('aria-selected', 'true')
    await expect(sell).toBeFocused()
    await expect(whisper).toBeHidden()
    await expect(market.getByText('Лечебные травы', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(market).toBeHidden()
    await expect(whisper).toBeVisible()
    await expect(input).toBeFocused()
})

for (const mobile of [false, true]) {
    test(`keeps private whisper and direct merchant services (${mobile ? 'mobile' : 'desktop'})`, async ({
        page,
    }, info) => {
        test.setTimeout(90_000)
        await page.setViewportSize(
            mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
        )
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.addStyleTag({ content: '.test-panel { display: none !important }' })
        await page.evaluate(
            (name) => window.__ratataTest!.join(name),
            `speech-merchant-${info.workerIndex}-${mobile}`
        )
        await approachMerchant(page)

        const menu = await openMerchantMenu(page, mobile)
        await expect(menu.getByRole('menuitem', { name: /^Поговорить:/u })).toHaveCount(0)
        await expect(menu.getByRole('menuitem', { name: /^Купить:/u })).toBeVisible()
        const whisper = menu.getByRole('menuitem', { name: /^Шёпот:/u })
        await expect(whisper).toBeEnabled()
        await whisper.focus()
        await page.keyboard.press('Enter')

        const dialogue = page.getByRole('dialog', { name: /^Шёпот:/u })
        const input = dialogue.getByPlaceholder('Сообщение собеседнику')
        const question = 'Что сегодня есть в лавке?'
        await input.fill(question)
        await input.press('Enter')
        await expect(dialogue).toContainText(question)
        await expect(dialogue).toContainText('Я слушаю. Чем тебе помочь?')
        await page.keyboard.press('Escape')
        await expect(dialogue).toHaveCount(0)

        const chat = page.locator('.game-chat')
        await chat.getByRole('button', { name: 'Развернуть историю чата' }).click()
        const history = chat.getByRole('list', { name: 'Услышанные реплики' })
        await chat.getByRole('button', { name: 'Рядом', exact: true }).click()
        await expect(history).not.toContainText(question)
        await expect(history).not.toContainText('Я слушаю. Чем тебе помочь?')
        await chat.getByRole('button', { name: 'Личные', exact: true }).click()
        await expect(history).toContainText(question)
        await expect(history).toContainText('Я слушаю. Чем тебе помочь?')

        const services = await openMerchantMenu(page, mobile)
        await services.getByRole('menuitem', { name: /^Купить:/u }).click()
        const shop = page.getByRole('dialog', { name: /^Товары · /u })
        const conversation = page.getByRole('dialog', { name: /^Разговор:/u })
        await expect(shop).toBeInViewport({ ratio: 1 })
        await expect(shop.getByRole('region', { name: 'Торговля', exact: true })).toBeVisible()
        const market = shop.getByRole('region', { name: 'Городской рынок' })
        await expect(market.getByText(/Городской налог 20%.*Платит торговец/u)).toBeVisible()
        await expect(market.getByText('Из них 1 ◈ — налог').first()).toBeVisible()
        await expect(shop.getByRole('button', { name: 'Вернуться к разговору' })).toBeEnabled()
        await expect(conversation).toHaveCount(0)
        await expect(page.getByRole('textbox', { name: 'Реплика собеседнику' })).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(shop).toHaveCount(0)
        await expect(conversation).toBeVisible()
    })
}

test('hands off from the merchant shop to a nearby player menu', async ({
    page,
    browser,
}, info) => {
    test.setTimeout(140_000)
    await joinSocial(page, `shop-switch-${info.workerIndex}`)
    await page.addStyleTag({ content: '.test-panel { display: none !important }' })
    await approachMerchant(page)
    const peer = await browser.newPage()
    try {
        const name = `shop-ally-${info.workerIndex}`
        const id = await joinSocial(peer, name)
        await enterBuilding(peer, 'Лавка')
        const meeting = await page.evaluate(() => window.__ratataTest!.getState().player!.position)
        await walkTo(peer, meeting, 8)
        await page.bringToFront()
        const services = await openMerchantMenu(page, false)
        await services.getByRole('menuitem', { name: /^Купить:/u }).click()

        const shop = page.getByRole('dialog', { name: /^Товары · /u })
        const key = `character:${id}`
        const arrow = shop.locator(`[data-dialogue-target-switch="${key}"]`)
        await expect(arrow).toContainText(name)
        await arrow.click()
        await expect(shop).toHaveCount(0)
        await expect(selectedWorldTarget(page)).toHaveAttribute('data-selected-target-key', key)
        await expect(page.getByRole('menu', { name, exact: true })).toBeVisible()
        await expect(page.getByRole('dialog', { name: `Шёпот: ${name}` })).toHaveCount(0)
        await expect
            .poll(() =>
                peer.evaluate(
                    () => window.__ratataTest!.getState().snapshot?.social?.exchange ?? null
                )
            )
            .toBeNull()
    } finally {
        await peer.close()
    }
})

test('uses F to talk across a low guild table', async ({ page, browser }) => {
    test.setTimeout(75_000)
    const peer = await browser.newPage()
    try {
        await joinSocial(page, 'table-speaker')
        const listener = await joinSocial(peer, 'table-listener')
        const entry = await page.evaluate(
            () =>
                window
                    .__ratataTest!.observe()
                    .targets.find(
                        ({ kind, name }) => kind === 'building' && name.includes('Гильдия')
                    )!.position
        )
        await enterBuilding(page, 'Гильдия')
        await enterBuilding(peer, 'Гильдия')
        // In the browser world the low table occupies the row between these tiles.
        await walkTo(page, { x: entry.x - 32, y: entry.y - 80 }, 2)
        await walkTo(peer, { x: entry.x - 32, y: entry.y - 112 }, 2)
        await expect
            .poll(() =>
                page.evaluate(
                    (id) =>
                        window
                            .__ratataTest!.getState()
                            .snapshot!.characters.find((actor) => actor.id === id)?.interactions
                            ?.speechReachable,
                    listener
                )
            )
            .toBe(true)

        await page.bringToFront()
        await page.locator('canvas[data-game-canvas=true]').focus()
        await selectSocialTarget(page, listener)
        await page.keyboard.press('KeyF')
        const talk = page.getByRole('menu', { name: 'table-listener', exact: true })
        await expect(talk.getByRole('menuitem')).toHaveText('Шёпот: table-listener')
        await page.keyboard.press('Enter')
        const whisper = page.getByRole('dialog', { name: 'Шёпот: table-listener' })
        const text = 'Слышно через стол?'
        await whisper.getByPlaceholder('Сообщение собеседнику').fill(text)
        await whisper.getByPlaceholder('Сообщение собеседнику').press('Enter')
        await expect
            .poll(() =>
                peer.evaluate(
                    () =>
                        window.__ratataTest!.getState().snapshot?.social?.whisper?.messages.at(-1)
                            ?.text
                )
            )
            .toBe(text)
    } finally {
        await peer.close()
    }
})

async function approachMerchant(page: Page, npcId = merchantId, building = 'Лавка'): Promise<void> {
    await enterBuilding(page, building)
    await page.waitForFunction(
        (id) => window.__ratataTest!.observe().targets.some((target) => target.id === id),
        npcId
    )
    const merchant = await page.evaluate(
        (id) => window.__ratataTest!.observe().targets.find((target) => target.id === id)!,
        npcId
    )
    await walkTo(page, merchant.position, 20)
}

async function openMerchantMenu(page: Page, mobile: boolean) {
    await page.locator('canvas[data-game-canvas=true]').focus()
    const selected = selectedWorldTarget(page).and(
        page.locator(`[data-selected-target-key="character:${merchantId}"]`)
    )
    if ((await selected.count()) === 0) {
        await selectSocialTarget(page, merchantId)
    }
    if (mobile) await page.locator('.hotbar').getByRole('button', { name: /^F /u }).click()
    else await page.keyboard.press('KeyF')
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    return menu
}
