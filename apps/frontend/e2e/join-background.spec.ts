import { expect, test } from '@playwright/test'

for (const mobile of [false, true]) {
    test(`selects a background with native radio keys (${mobile ? 'mobile' : 'desktop'})`, async ({
        page,
    }) => {
        await page.setViewportSize(
            mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
        )
        await page.goto('/')
        const group = page.getByRole('group', { name: 'Прошлое героя' })
        await expect(group.getByRole('radio')).toHaveCount(4)
        const vanguard = group.getByRole('radio', { name: 'Авангард', exact: true })
        const ranger = group.getByRole('radio', { name: 'Следопыт', exact: true })
        await expect(vanguard).toBeChecked()
        const bonuses = page.getByRole('region', { name: 'Постоянные бонусы прошлого' })
        await expect(bonuses).toContainText('+20 к здоровью')
        await expect(bonuses).toContainText('+20 к энергии')
        await vanguard.focus()
        await page.keyboard.press('ArrowRight')
        await expect(ranger).toBeChecked()
        await expect(ranger).toBeFocused()
        await expect(page.locator('#class-description')).toContainText('Опыт странствий')
        await expect(bonuses).toContainText('+10 к здоровью')
        await expect(bonuses).toContainText('+20% опыта созвездия «Стрела»')
        await expect(bonuses).toContainText('+20 к энергии')
        await page.keyboard.press('ArrowLeft')
        await expect(vanguard).toBeChecked()
        const boxes = await group.locator('.class-card').evaluateAll((cards) =>
            cards.map((card) => {
                const { x, y, width } = card.getBoundingClientRect()
                return { x, y, width }
            })
        )
        expect(new Set(boxes.map((box) => box.y)).size).toBe(mobile ? 2 : 1)
        expect(boxes.every((box) => box.x >= 0 && box.x + box.width <= (mobile ? 390 : 1280))).toBe(
            true
        )
        await expect(group.locator('svg[viewBox="0 0 48 48"]')).toHaveCount(4)
    })
}
