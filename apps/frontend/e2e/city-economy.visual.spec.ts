import { expect, test } from '@playwright/test'

import { expectUiFits, readyUiStory, uiStoryUrl } from './ui-story-ready'

test('CityDemandReport keeps heating figures scrollable on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 460 })
    await page.goto(uiStoryUrl('entities-shops-citydemandreport--heating-supply'))
    const report = page.getByRole('region', { name: 'Спрос города' })
    await expect(report).toHaveAttribute('data-fantasy-border', 'border-026')
    await expect(report.getByText('Прокрутите таблицу по горизонтали')).toBeVisible()
    const fuel = report.getByRole('row').filter({ hasText: 'Хворост' })
    await expect(fuel.getByRole('rowheader').locator('.ui-item-slot img')).toBeVisible()
    await expect(fuel.getByRole('cell')).toHaveText(['6 / 12 / 24', '2', '1 / 2 ◈', '3 / 1'])
    await readyUiStory(page)
    await expectUiFits(report, 320)
    const scroll = report.locator('.city-demand__scroll')
    expect(await scroll.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    await expect(report).toHaveScreenshot('city-demand-heating-supply-320.png')
    await scroll.evaluate((element) => {
        element.scrollLeft = element.scrollWidth
    })
    await expect(fuel.getByRole('cell', { name: '3 / 1', exact: true })).toBeInViewport()
})

test('CityDemandReport displays all columns together on a wide screen', async ({ page }) => {
    await page.goto(uiStoryUrl('entities-shops-citydemandreport--default'))
    const report = page.getByRole('region', { name: 'Спрос города' })
    await expect(report.getByRole('columnheader').last()).toBeInViewport()
    await expect(report.getByText('Прокрутите таблицу по горизонтали')).toBeHidden()
    await readyUiStory(page)
    await expect(report).toHaveScreenshot('city-demand-default-1280.png')
})

test('CityMarket blocks purchases when heating fuel runs out', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 460 })
    await page.goto(uiStoryUrl('entities-shops-citymarket--heating-shortage'))
    const market = page.getByRole('region', { name: 'Городской рынок' })
    const buy = market.getByRole('tabpanel', { name: 'Купить' })
    await expect(buy.locator('.city-market__stock')).toHaveAttribute(
        'data-fantasy-border',
        'border-004'
    )
    await expect(buy.getByText('Хворост')).toBeVisible()
    await expect(buy.getByText('На складе 0 / 24')).toBeVisible()
    await expect(buy.getByRole('button', { name: 'Нет товара' })).toBeDisabled()
    await readyUiStory(page)
    await expectUiFits(market, 390)
    await expect(market).toHaveScreenshot('city-market-heating-shortage-390.png')
})

test('RepairWorkshop shows affordable repairs and disables them when blocked', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 460 })
    await page.goto(uiStoryUrl('entities-shops-repairworkshop--default'))
    const workshop = page.getByRole('region', { name: 'Ремонт снаряжения' })
    await expect(workshop).toHaveAttribute('data-fantasy-border', 'border-026')
    await expect(workshop.locator('.ui-item-slot img')).toHaveCount(2)
    const sword = workshop.getByRole('button', { name: 'Починить · 10 ◈' })
    const axe = workshop.getByRole('button', { name: 'Починить · 2 ◈' })
    const repairAll = workshop.getByRole('button', { name: 'Починить всё · 12 ◈' })
    await expect(workshop.getByText('0 / 200 · надето')).toBeVisible()
    await expect(workshop.getByText('850 / 1000')).toBeVisible()
    await expect(sword).toBeEnabled()
    await expect(axe).toBeEnabled()
    await expect(repairAll).toBeEnabled()
    await readyUiStory(page)
    await expectUiFits(workshop, 390)
    await expect(workshop).toHaveScreenshot('repair-workshop-390.png')

    await page.goto(uiStoryUrl('entities-shops-repairworkshop--blocked'))
    await expect(sword).toBeDisabled()
    await expect(axe).toBeDisabled()
    await expect(repairAll).toBeDisabled()
})

test('ItemCondition describes a broken item with no durability left', async ({ page }) => {
    await page.goto(uiStoryUrl('entities-items-itemcondition--broken'))
    await expect(page.getByText('Сломано — нужен ремонт')).toBeVisible()
    await expect(page.getByRole('meter')).toHaveAttribute('value', '0')
    await expect(page.getByRole('meter')).toHaveAttribute('max', '200')
})
