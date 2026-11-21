import { expect, type Locator, type Page, test } from '@playwright/test'

test.describe('shared gameplay controls', () => {
    test.setTimeout(60_000)
    for (const mobile of [false, true]) {
        test(`rebinds default slots and casts with the keyboard (${mobile ? 'mobile' : 'desktop'})`, async ({
            page,
        }, info) => {
            await page.setViewportSize(
                mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
            )
            await join(page, `keys-${info.workerIndex}-${mobile}`, 'arcanist')
            const hud = page.locator('.game-player-status')
            await expect(hud.locator('.hud-frame')).toBeVisible()
            await expect(hud.getByRole('list', { name: 'Player effects' })).toHaveCount(0)
            await expect(hud.getByText('Всё в порядке', { exact: true })).toHaveCount(0)
            const slots = page
                .getByLabel('Быстрые действия')
                .getByRole('button', { name: /^[1-4]:/ })
            await expect(slots).toHaveCount(4)
            await expect(slots.nth(0)).toHaveAccessibleName(/1: Удар ножом/)
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
            await expectPrivateBarrier(page)
            await expectDisclosedBarrier(page, hud, mobile)
            await expectMobileTargetBelowHud(page, hud, mobile)
            await expect(slots.nth(0).locator('.hotbar-cooldown')).toBeVisible()
            await page.keyboard.press('Shift+Digit4')
            await page.keyboard.press('ArrowDown')
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
            await expect(first.getByLabel('Мой отряд')).not.toContainText('100%')
            await expect(first.locator('.party-member__hp > span').first()).toHaveAttribute(
                'style',
                'width: 100%;'
            )
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

async function expectDisclosedBarrier(page: Page, hud: Locator, mobile: boolean): Promise<void> {
    const strip = hud.locator('.player-effects-strip')
    const effects = strip.getByRole('list', { name: 'Player effects' })
    const barrier = effects.getByRole('button', { name: /Магический барьер/ })
    const detail = strip.locator('[data-player-effect-detail]')
    await expect(barrier).toHaveAttribute('data-player-effect', 'barrier')
    await expect(barrier).toBeVisible()
    await expect(barrier).toHaveAttribute('aria-expanded', 'false')
    await expect(detail).toHaveCount(0)

    const frameBounds = (await hud.locator('.hud-frame').boundingBox())!
    const stripBounds = (await strip.boundingBox())!
    const locationBounds = (await page
        .getByRole('region', { name: 'World location' })
        .boundingBox())!
    const stripRight = stripBounds.x + stripBounds.width
    if (mobile) {
        expect(stripBounds.y).toBeGreaterThanOrEqual(frameBounds.y + frameBounds.height)
        expect(stripRight).toBeCloseTo(frameBounds.x + frameBounds.width, 1)
        expect(stripBounds.y).toBeGreaterThanOrEqual(locationBounds.y + locationBounds.height)
    } else {
        expect(stripRight).toBeLessThanOrEqual(frameBounds.x)
        expect(stripBounds.y).toBeCloseTo(frameBounds.y, 1)
        expect(stripBounds.x).toBeGreaterThanOrEqual(locationBounds.x + locationBounds.width)
    }

    await barrier.press('Enter')
    await expect(barrier).toHaveAttribute('aria-expanded', 'true')
    await expect(detail).toHaveCount(1)
    await expect(detail).toContainText('Магический барьер')
}

async function expectMobileTargetBelowHud(
    page: Page,
    hud: Locator,
    mobile: boolean
): Promise<void> {
    if (!mobile) return
    const target = page.getByLabel('Выбранная цель', { exact: true })
    await page.locator('canvas[data-game-canvas=true]').focus()
    await page.keyboard.press('KeyQ')
    await expect(target).toContainText('Вы')
    await expect(hud.locator('[data-player-effect-detail="barrier"]')).toBeVisible()
    await expect
        .poll(async () => {
            const hudBounds = (await hud.boundingBox())!
            const targetBounds = (await target.boundingBox())!
            return targetBounds.y - hudBounds.y - hudBounds.height
        })
        .toBeGreaterThanOrEqual(0)
    await page.keyboard.press('KeyQ')
    await expect(target).toHaveCount(0)
}

async function expectPrivateBarrier(page: Page): Promise<void> {
    await expect
        .poll(() =>
            page.evaluate(
                () => window.__ratataTest?.getState().player?.abilities?.barrier?.expiresAt ?? 0
            )
        )
        .toBeGreaterThan(0)
    expect(
        await page.evaluate(() => window.__ratataTest!.getState().player?.abilities?.barrier)
    ).not.toHaveProperty('remaining')
}

async function join(page: Page, name: string, heroClass: 'arcanist' | 'cleric' | 'vanguard') {
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.evaluate(async ({ name, heroClass }) => window.__ratataTest!.join(name, heroClass), {
        name,
        heroClass,
    })
    await expect(page.locator('canvas[data-game-canvas=true]')).toBeVisible()
}
