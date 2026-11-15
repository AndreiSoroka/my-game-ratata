import { expect, type Page, test } from '@playwright/test'

async function openGraveStory(page: Page, state: string): Promise<void> {
    await page.goto(`/iframe.html?id=interface-grave--${state}&viewMode=story`)
    await expect(page.getByLabel('Состояние могилы')).toBeVisible()
}

test.describe('Storybook production grave states', () => {
    test('active source rounds authorized HP and preserves stone damage multipliers', async ({
        page,
    }) => {
        await openGraveStory(page, 'active')
        const details = page.getByLabel('Состояние могилы')
        await expect(details).toContainText('100/100 HP')
        await expect(details).toContainText('Источник скелетов · камень')
        await expect(page.getByRole('progressbar', { name: 'Прочность могилы' })).toHaveAttribute(
            'value',
            '99.75'
        )
        await expect(page.getByRole('progressbar', { name: 'Прочность могилы' })).toHaveAttribute(
            'max',
            '100'
        )
        await expect(details.locator('dt')).toHaveText([
            'Кирка',
            'Оружие',
            'Магия',
            'Кулаки',
            'Стрелы',
        ])
        await expect(details.locator('dd')).toHaveText([
            '100% урона',
            '25% урона',
            '25% урона',
            '10% урона',
            '5% урона',
        ])
        await expect(details).toContainText('5 MP · 3 с без движения. Esc — прервать.')
    })

    test('ruined source displays the server-based restoration countdown', async ({ page }) => {
        await openGraveStory(page, 'ruined')
        const details = page.getByLabel('Состояние могилы')
        await expect(details).toContainText('Разрушенная могила')
        await expect(details).toContainText('0/100 HP')
        await expect(details).toContainText('Восстановится через 20:00')
        await expect(details).toContainText('5 MP · 3 с без движения. Esc — прервать.')
        await expect(page.getByRole('progressbar', { name: 'Прочность могилы' })).toHaveAttribute(
            'value',
            '0'
        )
    })

    test('purified source explains permanence without a restoration timer or damage table', async ({
        page,
    }) => {
        await openGraveStory(page, 'purified')
        const details = page.getByLabel('Состояние могилы')
        await expect(details).toContainText('Очищенная могила')
        await expect(details).toContainText('Источник нежити очищен навсегда.')
        await expect(details).not.toContainText('Восстановится')
        await expect(details.locator('dl')).toHaveCount(0)
    })

    test('compact target rounds HP text while retaining its fractional bar fill', async ({
        page,
    }) => {
        await openGraveStory(page, 'compact-target')
        const details = page.getByLabel('Состояние могилы')
        await expect(details).toContainText('0/100 HP')
        await expect(page.getByRole('progressbar', { name: 'Прочность могилы' })).toHaveAttribute(
            'value',
            '0.05'
        )
        await expect(details.locator('dl')).toHaveCount(0)
        await expect(details).not.toContainText('Esc — прервать')
    })
})

test('Storybook production purification channel exposes its remaining time and cancel button', async ({
    page,
}) => {
    await page.goto('/iframe.html?id=interface-prayer-channel--purifying-grave&viewMode=story')
    await expect(page.getByRole('status')).toContainText('Очищение могилы · 2.5 с')
    const cancel = page.getByRole('button', { name: 'Прервать · Esc' })
    await expect(cancel).toBeVisible()
    await expect(cancel).toBeEnabled()
    await cancel.focus()
    await expect(cancel).toBeFocused()
})
