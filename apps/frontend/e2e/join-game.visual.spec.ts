import { expect, test } from '@playwright/test'

import { expectThemedBorder, heroThemeCases } from './hero-theme-visual'
import { expectUiFits, readyUiStory } from './ui-story-ready'

test.use({ reducedMotion: 'reduce' })

const regionStory = 'entities-region-lore-regionlore'
const regionHeading = /Новогород\s*и дальние земли/
const regionDescription = /Почему твоя Искра пробудилась/

test('region lore renders the authored copy and supports Storybook controls', async ({ page }) => {
    await page.goto(`/iframe.html?id=${regionStory}--default&viewMode=story`)
    const lore = page.locator('.region-lore')
    await expect(lore.getByRole('heading', { level: 2, name: regionHeading })).toBeVisible()
    await expect(lore).toContainText(/25 локаций/i)
    await expect(lore.getByText(regionDescription)).toBeVisible()
    await expect(lore.getByText(/Искра живёт в персонаже/)).toBeVisible()
    await readyUiStory(page)
    await expect(lore).toHaveScreenshot('region-lore-default.png')

    await page.goto(`/iframe.html?id=${regionStory}--default&viewMode=story&args=locationCount:21`)
    await expect(lore).toContainText(/21 локация/i)
})

test('region lore adapts to a narrow viewport on the game backdrop', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/iframe.html?id=${regionStory}--with-backdrop&viewMode=story`)
    const lore = page.locator('.region-lore')
    await expect(lore.getByRole('heading', { level: 2, name: regionHeading })).toBeVisible()
    await expect(lore.getByText(regionDescription)).toBeVisible()
    await expect(lore.getByText(/Искра живёт в персонаже/)).toBeHidden()
    await expectUiFits(lore, 390)
    await readyUiStory(page)
    await expect(lore).toHaveScreenshot('region-lore-backdrop-390.png')
})

test('credit badges appear together in the composed start screen', async ({ page }) => {
    await page.goto('/iframe.html?id=game-joingamepanel--ready&viewMode=story')
    const credits = page.getByRole('navigation', { name: 'Ссылки проекта' })
    await expect(credits.getByRole('link')).toHaveCount(3)
    await readyUiStory(page)
    await expect(credits).toHaveScreenshot('join-credit-badges.png')
})

for (const width of [1280, 390, 320]) {
    const themes = (width === 1280 ? [heroThemeCases[1]] : heroThemeCases).map((theme) => ({
        ...theme,
        image: `join-selected-focus${theme.heroClass === 'ranger' ? '' : `-${theme.heroClass}`}-${width}.png`,
    }))

    test(`hero background selection and focus at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto('/iframe.html?id=game-joingamepanel--ready&viewMode=story')
        const form = page.locator('.join-panel')
        await expect(form.getByRole('button', { name: 'Войти', exact: true })).toBeEnabled()
        await expect(form).toHaveCSS('border-top-width', '0px')
        await expect(form.locator('.chat-composer-frame #nickname')).toBeVisible()
        await expect(form.locator('.chat-composer-frame__border')).toHaveCSS(
            'border-top-width',
            '16px'
        )
        await expect(form.locator('.chat-composer-frame .ui-input')).toHaveCSS('box-shadow', 'none')
        await expect(form).not.toContainText('Начальные запасы до звёзд')
        const accents = new Set<string>()
        for (const { heroClass, label, border, image } of themes) {
            const radio = form.locator(`input[value="${heroClass}"]`)
            await radio.focus()
            await page.keyboard.press('Space')
            await expect(radio).toBeChecked()
            await expect(radio).toBeFocused()
            const card = form.locator('.class-card__content--selected')
            await expect(card).toHaveText(label)
            await expect(card).toHaveCSS('box-shadow', 'none')
            await expect(card).toHaveCSS('outline-style', 'solid')
            accents.add(
                await expectThemedBorder(
                    form.locator(':scope > .game-frame [data-fantasy-border]'),
                    border,
                    16
                )
            )
            await expectUiFits(form, width)
            await readyUiStory(page)
            await expect(form).toHaveScreenshot(image)
        }
        expect(accents.size).toBe(themes.length)
    })
}
