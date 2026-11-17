import { expect, test } from '@playwright/test'

import {
    captureExchange,
    expectGiftSettlement,
    gatherGift,
    joinSocial,
    socialMenu,
} from './social-helpers'

for (const layout of [
    { name: 'desktop', width: 1280, height: 800, axis: 'x' as const },
    { name: 'mobile', width: 390, height: 844, axis: 'y' as const },
    { name: 'compact', width: 320, height: 480, axis: 'y' as const },
]) {
    test(`toggles Q and trades a real gift with private chat (${layout.name})`, async ({
        browser,
    }, info) => {
        test.setTimeout(100_000)
        const viewport = { width: layout.width, height: layout.height }
        const context = await browser.newContext({ viewport })
        const first = await context.newPage()
        const second = await context.newPage()
        try {
            const firstId = await joinSocial(first, `gift-a-${info.project.name}-${layout.name}`)
            const giftId = await gatherGift(first)
            const secondId = await joinSocial(second, `gift-b-${info.project.name}-${layout.name}`)
            const point = await first.evaluate(
                () => window.__ratataTest!.getState().player!.position
            )
            const arrival = await second.evaluate(
                (position) =>
                    window.__ratataTest!.navigate(position, { tolerance: 20, timeoutMs: 25_000 }),
                point
            )
            expect(arrival.status).toBe('arrived')
            await first.locator('canvas[data-game-canvas=true]').focus()
            await first.keyboard.press('KeyQ')
            await expect(first.getByLabel('Выбранная цель')).toContainText('Вы')
            await first.keyboard.down('KeyQ')
            await first.keyboard.down('KeyQ')
            await first.keyboard.up('KeyQ')
            await expect(first.getByLabel('Выбранная цель')).toHaveCount(0)
            await socialMenu(first, secondId, /^Шёпот:/)
            const whisper = first.getByRole('dialog', { name: /^Шёпот:/ })
            const position = await first.evaluate(
                () => window.__ratataTest!.getState().player!.position
            )
            await whisper.getByPlaceholder('Сообщение собеседнику').fill('Подарю волокно')
            await first.keyboard.press('Enter')
            await expect
                .poll(() =>
                    second.evaluate(
                        () =>
                            window
                                .__ratataTest!.getState()
                                .snapshot!.social?.whisper?.messages.at(-1)?.text
                    )
                )
                .toBe('Подарю волокно')
            await expect(second.getByRole('dialog', { name: /^Шёпот:/ })).toHaveCount(0)
            expect(
                await first.evaluate(() => window.__ratataTest!.getState().player!.position)
            ).toEqual(position)
            await first.keyboard.press('Escape')
            await socialMenu(first, secondId, /^Обменяться:/)
            await second.getByRole('button', { name: /приглашение к обмену/ }).click()
            await second.getByRole('button', { name: 'Начать обмен', exact: true }).click()
            const trade = first.getByRole('dialog', { name: /^Обмен:/ })
            await expect(trade.getByLabel('Ваши вещи для обмена')).toBeVisible()
            await trade.locator(`#exchange-${giftId}`).fill('1')
            await expect(
                trade.getByRole('button', { name: 'Предложить', exact: true })
            ).toBeEnabled()
            await trade.getByRole('button', { name: 'Предложить', exact: true }).click()
            await expect
                .poll(() =>
                    first.evaluate(
                        () =>
                            window.__ratataTest!.getState().snapshot!.social?.exchange?.own.items
                                .length
                    )
                )
                .toBe(1)
            await trade.getByPlaceholder('Сообщение собеседнику').fill('Это подарок')
            await first.keyboard.press('Enter')
            await expect
                .poll(() =>
                    first.evaluate(
                        () =>
                            window.__ratataTest!.getState().snapshot!.social?.exchange?.own.accepted
                    )
                )
                .toBe(false)
            const panes = await trade.locator('.exchange-offer').all()
            const own = await panes[0]!.boundingBox()
            const other = await panes[1]!.boundingBox()
            expect(own!.x).toBeGreaterThanOrEqual(0)
            expect(other!.x + other!.width).toBeLessThanOrEqual(viewport.width)
            expect(other![layout.axis]).toBeGreaterThan(own![layout.axis])
            await trade.getByRole('button', { name: 'Подтвердить', exact: true }).click()
            await expect
                .poll(() =>
                    first.evaluate(
                        () =>
                            window.__ratataTest!.getState().snapshot!.social?.exchange?.own.accepted
                    )
                )
                .toBe(true)
            await captureExchange(first, layout.name)
            await second.getByRole('button', { name: 'Подтвердить', exact: true }).click()
            await expectGiftSettlement(first, second, giftId)
            expect(firstId).not.toBe(secondId)
        } finally {
            await context.close()
        }
    })
}
