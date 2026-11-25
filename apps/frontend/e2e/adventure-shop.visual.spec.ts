import { expect, type Page, test } from '@playwright/test'

import { expectUiFits, readyUiStory, uiStoryUrl } from './ui-story-ready'

const storyId = 'widgets-shops-adventureshopwidget'
const heading = 'Товары · Савва'
const backName = /Вернуться к разговору/u

async function openShop(page: Page, story: string, width: number) {
    await page.setViewportSize({ width, height: width === 320 ? 460 : 800 })
    await page.goto(uiStoryUrl(`${storyId}--${story}`))
    const shop = page.locator('.adventure-shop-window')
    await expect(shop.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await expect(shop.getByRole('button', { name: `Закрыть: ${heading}` })).toBeEnabled()
    await expect(shop.getByRole('button', { name: backName })).toBeEnabled()
    await readyUiStory(page)
    await expectUiFits(shop, width)
    return shop
}

for (const width of [1280, 320]) {
    test(`AdventureShopWidget catalogue at ${width}px`, async ({ page }) => {
        const shop = await openShop(page, 'default', width)
        const apple = shop.getByRole('button', { name: /Яблоко/u })
        await expect(apple).toBeEnabled()
        await expect(apple.locator('img')).toHaveJSProperty('naturalWidth', 16)
        await expect(shop.getByRole('button', { name: /Сапоги/u })).toBeDisabled()
        await expect(shop).toHaveScreenshot(`adventure-shop-default-${width}.png`)
    })

    test(`AdventureShopWidget market at ${width}px`, async ({ page }) => {
        const shop = await openShop(page, 'market', width)
        const market = shop.getByRole('region', { name: 'Городской рынок' })
        const tabs = market.getByRole('tablist')
        const buy = tabs.getByRole('tab', { name: 'Купить', exact: true })
        const sell = tabs.getByRole('tab', { name: 'Продать', exact: true })
        const purchase = market
            .getByRole('tabpanel', { name: 'Купить', exact: true })
            .getByRole('button', { name: 'Купить · 3 ◈', exact: true })
        await expect(purchase).toBeEnabled()
        await expect(purchase).toHaveAccessibleDescription('Из них 1 ◈ — налог')
        await expect(market.getByText('Из них 1 ◈ — налог')).toBeVisible()
        await expect(market.getByText(/Городской налог 20%.*Платит торговец/u)).toBeVisible()
        await expect(buy).toHaveAttribute('aria-selected', 'true')
        await expect(sell).toHaveAttribute('tabindex', '-1')
        await expect(shop).toHaveScreenshot(`adventure-shop-market-${width}.png`)

        await market.getByRole('spinbutton').fill('2')
        const bulkPurchase = market.getByRole('button', { name: 'Купить · 7 ◈', exact: true })
        await expect(bulkPurchase).toBeEnabled()
        await expect(bulkPurchase).toHaveAccessibleDescription('Из них 2 ◈ — налог')
        await expect(market.getByText('Из них 2 ◈ — налог')).toBeVisible()
        await buy.press('ArrowRight')
        await expect(sell).toBeFocused()
        await expect(sell).toHaveAttribute('aria-selected', 'true')
        await expect(buy).toHaveAttribute('tabindex', '-1')
        const sale = market
            .getByRole('tabpanel', { name: 'Продать', exact: true })
            .getByRole('button', { name: /^Продать 2 · 3 ◈/u })
        await expect(sale).toBeEnabled()
        await expect(sale.getByText('Налог · 1 ◈')).toBeVisible()
        await expect(
            market.getByText(/Городской налог 20%.*удерживается из выручки/u)
        ).toBeVisible()
        await expectUiFits(shop, width)
        await sell.press('Home')
        await expect(buy).toBeFocused()
        await buy.press('End')
        await expect(sell).toBeFocused()
        await sell.press('ArrowLeft')
        await expect(buy).toBeFocused()
        await expect(buy).toHaveAttribute('aria-selected', 'true')
        await expect(market.getByRole('spinbutton')).toHaveValue('2')
    })
}

test('AdventureShopWidget scrolls the market while the footer stays visible', async ({ page }) => {
    const shop = await openShop(page, 'market', 320)
    await page.setViewportSize({ width: 320, height: 224 })
    const body = shop.locator('.dark-window-frame__body')
    await expect
        .poll(() => body.evaluate((element) => element.scrollHeight > element.clientHeight))
        .toBe(true)
    await expect(shop.getByRole('button', { name: backName })).toBeInViewport()
})

test('AdventureShopWidget keeps the return action when trading is blocked', async ({ page }) => {
    const shop = await openShop(page, 'blocked', 320)
    await expect(shop.getByRole('status')).toHaveText('Вы в чёрном списке Новогорода.')
    await expect(shop.getByRole('button', { name: /Яблоко/u })).toBeDisabled()
    await expect(shop.getByRole('button', { name: /Сапоги/u })).toBeDisabled()
    await expect(shop).toHaveScreenshot('adventure-shop-blocked-320.png')
})
