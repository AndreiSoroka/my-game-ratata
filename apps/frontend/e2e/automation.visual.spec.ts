import { expect, test } from '@playwright/test'

import { expectUiFits, readyUiStory, uiStoryUrl } from './ui-story-ready'

test('scenario templates, reactions and pseudocode fit the mobile editor', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(uiStoryUrl('pages-gameplay-scenariopanel--reaction-builder'))
    const window = page.getByRole('dialog', { name: 'Сценарии' })
    await expect(window.getByRole('heading', { name: 'Реакция 1' })).toBeVisible()
    await expectUiFits(window, 390)
    await window.getByRole('heading', { name: 'Реакции', exact: true }).scrollIntoViewIfNeeded()
    await readyUiStory(page)
    await expect(window).toHaveScreenshot('scenario-reaction-builder.png')

    await window.getByRole('button', { name: 'Готовые сценарии', exact: true }).click()
    await window.getByRole('combobox', { name: 'Шаблон', exact: true }).selectOption('retreat')
    await window
        .getByRole('combobox', { name: 'Метка укрытия', exact: true })
        .selectOption('marker-1')
    await expectUiFits(window, 390)
    await readyUiStory(page)
    await expect(window).toHaveScreenshot('scenario-template.png')

    await window.getByRole('button', { name: 'Создать копию', exact: true }).click()
    await expect(window.getByLabel('Название сценария', { exact: true })).toBeFocused()
    await window.getByRole('button', { name: 'Псевдокод', exact: true }).click()
    await expect(window.getByRole('textbox', { name: 'Псевдокод', exact: true })).toHaveValue(
        /on enemy_visible\(5 tiles\)/
    )
    await readyUiStory(page)
    await expect(window).toHaveScreenshot('scenario-pseudocode.png')
})

test('an active reaction is visible alongside normal run controls', async ({ page }) => {
    await page.goto(uiStoryUrl('entities-scenarios-scenariorunstatus--active-reaction'))
    const status = page.getByRole('region', { name: 'Выполнение сценария' })
    await expect(status.getByText('Реакция · Отступление', { exact: false })).toBeVisible()
    await expect(status.getByRole('button', { name: 'Остановить', exact: true })).toBeVisible()
    await readyUiStory(page)
    await expect(status).toHaveScreenshot('scenario-active-reaction.png')
})
