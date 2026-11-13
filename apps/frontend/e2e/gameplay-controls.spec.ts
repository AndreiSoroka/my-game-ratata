import { expect, type Page, test } from '@playwright/test'

test.describe('shared gameplay controls', () => {
    test.setTimeout(60_000)
    for (const mobile of [false, true]) {
        test(`assigns empty slots and casts with the keyboard (${mobile ? 'mobile' : 'desktop'})`, async ({
            page,
        }, info) => {
            await page.setViewportSize(
                mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
            )
            await join(page, `keys-${info.workerIndex}-${mobile}`, 'arcanist')
            const slots = page
                .getByLabel('Быстрые действия')
                .getByRole('button', { name: /^[1-4]:/ })
            await expect(slots).toHaveCount(4)
            await expect(slots.nth(0)).toHaveAccessibleName(/1: Пусто/)
            await page.keyboard.press('Shift+Digit1')
            await expect(page.getByRole('dialog', { name: 'Назначить слот 1' })).toBeVisible()
            // Mage order: spark, barrier. Menu arrows must not leak into movement.
            const position = await page.evaluate(
                () => window.__ratataTest?.getState().player?.position
            )
            await page.keyboard.press('ArrowDown')
            await page.keyboard.press('Enter')
            await expect(slots.nth(0)).toHaveAccessibleName(/1: Барьер/)
            expect(
                await page.evaluate(() => window.__ratataTest?.getState().player?.position)
            ).toEqual(position)
            await page.keyboard.press('Digit1')
            await expect
                .poll(() =>
                    page.evaluate(
                        () => window.__ratataTest?.getState().player?.abilities?.barrier?.remaining
                    )
                )
                .toBe(8)
            await expect(slots.nth(0).locator('.hotbar-cooldown')).toBeVisible()
            await page.keyboard.press('Shift+Digit4')
            await page.keyboard.press('ArrowDown')
            await page.keyboard.press('ArrowDown')
            await page.keyboard.press('Enter')
            await expect(slots.nth(3)).toHaveAccessibleName(/4: Яблоко/)
            const box = await page.getByLabel('Быстрые действия').boundingBox()
            expect(box?.x).toBeGreaterThanOrEqual(0)
            expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(mobile ? 390 : 1280)
        })
    }

    test('forms a party, rejects reciprocal invites and cancels follow on manual input', async ({
        browser,
    }, info) => {
        const firstContext = await browser.newContext()
        const secondContext = await browser.newContext()
        const first = await firstContext.newPage()
        const second = await secondContext.newPage()
        try {
            await join(first, `party-a-${info.workerIndex}`, 'cleric')
            await join(second, `party-b-${info.workerIndex}`, 'vanguard')
            const firstId = await first.evaluate(
                () => window.__ratataTest!.getState().localPlayerId!
            )
            const secondId = await second.evaluate(
                () => window.__ratataTest!.getState().localPlayerId!
            )
            await first.evaluate(
                (targetId) => window.__ratataTest!.send({ type: 'party_invite', targetId }),
                secondId
            )
            await expect
                .poll(() =>
                    second.evaluate(
                        () => window.__ratataTest!.getState().snapshot?.party?.invitations.length
                    )
                )
                .toBe(1)
            await second.evaluate(
                (targetId) => window.__ratataTest!.send({ type: 'party_invite', targetId }),
                firstId
            )
            await expect
                .poll(() =>
                    second.evaluate(
                        () => window.__ratataTest!.getState().snapshot?.party?.invitations.length
                    )
                )
                .toBe(1)
            await second.evaluate(() => {
                const invitationId =
                    window.__ratataTest!.getState().snapshot!.party!.invitations[0]!.id
                window.__ratataTest!.send({ type: 'party_answer', invitationId, accept: true })
            })
            await expect(first.getByLabel('Мой отряд').getByRole('button')).toHaveCount(2)
            await expect(first.getByRole('img', { name: 'Лидер', exact: true })).toHaveCount(1)
            await expect(first.getByLabel('Мой отряд')).toContainText('100%')
            await first.evaluate(
                (targetId) => window.__ratataTest!.send({ type: 'follow', targetId }),
                secondId
            )
            await expect
                .poll(() =>
                    first.evaluate(() => window.__ratataTest!.getState().player?.control?.mode)
                )
                .toBe('follow')
            await first.keyboard.press('KeyW')
            await expect
                .poll(() =>
                    first.evaluate(() => window.__ratataTest!.getState().player?.control?.mode)
                )
                .toBe('none')
        } finally {
            await firstContext.close()
            await secondContext.close()
        }
    })
})

async function join(page: Page, name: string, heroClass: 'arcanist' | 'cleric' | 'vanguard') {
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.evaluate(async ({ name, heroClass }) => window.__ratataTest!.join(name, heroClass), {
        name,
        heroClass,
    })
    await expect(page.locator('canvas[data-game-canvas=true]')).toBeVisible()
}
