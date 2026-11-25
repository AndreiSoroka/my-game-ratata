import { expect, type Page, test } from '@playwright/test'

async function openGraveStory(page: Page, state: string): Promise<void> {
    await page.goto(`/iframe.html?id=entities-graves-gravedetails--${state}&viewMode=story`)
    await expect(page.getByLabel('Состояние могилы')).toBeVisible()
}

test.describe('Storybook production grave states', () => {
    test('active source rounds authorized HP and shows only the short guidance', async ({
        page,
    }) => {
        await openGraveStory(page, 'active')
        const details = page.getByLabel('Состояние могилы')
        await expect(details).toContainText('100/100 HP')
        await expect(details).toContainText(
            'Из могил могут подниматься скелеты, поэтому их надо разрушить или очистить.'
        )
        await expect(details).toContainText('Киркой быстрее, оружием и магией дольше.')
        await expect(page.getByRole('progressbar', { name: 'Прочность могилы' })).toHaveAttribute(
            'aria-valuenow',
            '99.75'
        )
        await expect(page.getByRole('progressbar', { name: 'Прочность могилы' })).toHaveAttribute(
            'aria-valuemax',
            '100'
        )
        await expect(details.locator('.bar-track')).toHaveCSS('height', '14px')
        await expect(details.locator('dl')).toHaveCount(0)
        await expect(details).not.toContainText('5 MP')
    })

    test('ruined source displays the server-based restoration countdown', async ({ page }) => {
        await openGraveStory(page, 'ruined')
        const details = page.getByLabel('Состояние могилы')
        await expect(details).toContainText('Разрушенная могила')
        await expect(details).toContainText('0/100 HP')
        await expect(details).toContainText('Восстановится через 20:00')
        await expect(page.getByRole('progressbar', { name: 'Прочность могилы' })).toHaveAttribute(
            'aria-valuenow',
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

    test('rounds HP text while retaining its fractional bar fill', async ({ page }) => {
        await openGraveStory(page, 'fractional-health')
        const details = page.getByLabel('Состояние могилы')
        await expect(details).toContainText('0/100 HP')
        await expect(page.getByRole('progressbar', { name: 'Прочность могилы' })).toHaveAttribute(
            'aria-valuenow',
            '0.05'
        )
        await expect(details.locator('dl')).toHaveCount(0)
        await expect(details).not.toContainText('Esc — прервать')
    })

    test('renders localized English guidance at narrow width', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 700 })
        await openGraveStory(page, 'active')
        await page.evaluate(async (modulePath) => {
            const { setGameLocale } = await import(modulePath)
            setGameLocale('en')
        }, '/src/shared/lib/i18n/index.ts')
        const details = page.getByLabel('Grave condition')
        await expect(details).toContainText(
            'Skeletons can rise from graves, so graves must be destroyed or purified.'
        )
        await expect(details).toContainText(
            'A pickaxe works fastest. Weapons and magic take longer.'
        )
        await expect(details.locator('.bar-track')).toHaveCSS('height', '14px')
    })
})

test('Storybook purification channel shows only a compact cancel button on narrow screens', async ({
    page,
}) => {
    await page.goto('/iframe.html?id=game-actionchannelstatus--purifying-grave&viewMode=story')
    await expect(page.locator('#storybook-root > div')).toBeVisible()
    const cancel = page.getByRole('button', { name: 'Прервать молитву' })
    await expect(page.getByRole('status')).toHaveCount(0)
    await expect(cancel).toBeHidden()

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('status')).toHaveCount(0)
    await expect(cancel).toBeVisible()
    await expect(cancel).toHaveText('×')
    await expect(cancel).toBeEnabled()
    await cancel.focus()
    await expect(cancel).toBeFocused()
})
