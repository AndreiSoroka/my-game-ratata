import { expect, type Page, test } from '@playwright/test'

import { expectUiFits, readyUiStory, uiStoryUrl } from './ui-story-ready'

async function openCard(page: Page, story: string, { width = 320, args = '' } = {}) {
    await page.setViewportSize({ width, height: 640 })
    const url = uiStoryUrl(`entities-quests-guildquestcard--${story}`)
    await page.goto(args ? `${url}&${new URLSearchParams({ args })}` : url)
    const card = page.getByRole('article', { name: 'Общий контракт', exact: true })
    await expect(card).toBeVisible()
    await readyUiStory(page)
    await expectUiFits(card, width)
    return card
}

test('shows a ready contract with the shared progress bar and chat turn-in guidance', async ({
    page,
}) => {
    const card = await openCard(page, 'default', { width: 1280 })
    const progress = card.getByRole('progressbar', { name: 'Побеждено враждебных слизней' })
    await expect(progress).toHaveAttribute('aria-valuenow', '3')
    await expect(progress).toHaveAttribute('aria-valuemax', '3')
    await expect(card.getByText(/скажите «квест готов»/)).toBeVisible()
    await expect(card.getByRole('button')).toHaveCount(1)
    await expect(card.getByRole('button', { name: 'Отказаться от договора' })).toBeEnabled()
    await expect(card).toHaveScreenshot('guild-quest-ready-1280.png')
})

test('explains a blocked verification trip after the trophy is accepted', async ({ page }) => {
    const card = await openCard(page, 'trial-blocked')
    await expect(card.getByText('Работник пробует работать', { exact: true })).toBeVisible()
    await expect(card.getByRole('status')).toHaveText(/Пшеница ещё растёт/)
    await expect(card.getByText(/Трофей принят/)).toBeVisible()
    await expect(card.getByRole('button', { name: 'Передать трофей и доложить' })).toBeHidden()
    await expect(card.getByRole('button', { name: 'Отказаться от обращения' })).toBeEnabled()
    await expect(card).toHaveScreenshot('guild-quest-trial-blocked-320.png')
})

test('shows the trophy and disables abandoning for players without permission', async ({
    page,
}) => {
    const card = await openCard(page, 'awaiting-proof')
    const trophy = card.getByRole('listitem').filter({ hasText: 'Кость × 1' })
    await expect(trophy.locator('img')).toHaveJSProperty('naturalWidth', 16)
    const abandon = card.getByRole('button', { name: 'Отказаться от обращения' })
    await expect(card.getByRole('button')).toHaveCount(1)
    await expect(abandon).toBeEnabled()

    await openCard(page, 'awaiting-proof', { args: 'canAbandon:!false' })
    await expect(abandon).toBeDisabled()
})

test('shows the player’s share and identifies who receives item rewards', async ({ page }) => {
    const card = await openCard(page, 'shared-reward')
    await expect(card.getByText('Получено вами: 15 золотых', { exact: true })).toBeVisible()
    await expect(card.getByRole('listitem').filter({ hasText: 'Яблоко × 1' })).toBeVisible()
    await expect(
        card.getByText('Предметную награду получает тот, кто сдаёт договор.')
    ).toBeVisible()
    await expect(card.getByRole('button')).toHaveCount(0)
})
