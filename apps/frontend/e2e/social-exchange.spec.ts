import { type Browser, type Page, test, type TestInfo } from '@playwright/test'

import {
    captureExchange,
    expectGiftSettlement,
    gatherGift,
    joinSocial,
    socialExpect,
    socialMenu,
} from './social-helpers'

const expect = socialExpect
test.use({ trace: 'retain-on-failure' })

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
        const { context, first, second, exchangeFrames } = await openTradePages(browser, viewport)
        let giftId: string | undefined
        try {
            const firstName = `g-a-${info.project.name}-${layout.name}-${String(info.repeatEachIndex)}`
            const secondName = `g-b-${info.project.name}-${layout.name}-${String(info.repeatEachIndex)}`
            const firstId = await joinSocial(first, firstName)
            giftId = await gatherGift(first)
            const secondId = await joinSocial(second, secondName)
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
            await exerciseTradeInvitation(first, second, {
                firstId,
                firstName,
                secondId,
                secondName,
            })
            const trade = first.getByRole('dialog', { name: /^Обмен:/ })
            await expect(trade.getByLabel('Ваши вещи для обмена')).toBeVisible()
            await proposeGift(first, giftId, exchangeFrames)
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
            await expect(first.getByRole('dialog', { name: /^Обмен:/ })).toHaveCount(0)
            await expect(second.getByRole('dialog', { name: /^Обмен:/ })).toHaveCount(0)
            await expect(first.getByRole('dialog', { name: /^Шёпот:/ })).toHaveCount(0)
            await assertHudLayout(first)
            await first.getByRole('button', { name: /^Шёпот:/ }).click()
            await expect(first.getByRole('dialog', { name: /^Шёпот:/ })).toContainText(
                'Это подарок'
            )
            expect(firstId).not.toBe(secondId)
        } catch (error) {
            await attachExchangeFailure(info, exchangeFrames, first, second, giftId)
            throw error
        } finally {
            await context.close()
        }
    })
}

async function exerciseTradeInvitation(
    first: Page,
    second: Page,
    players: { firstId: string; firstName: string; secondId: string; secondName: string }
): Promise<void> {
    const outgoing = first.getByRole('region', { name: 'Предложение отправлено' })
    const incoming = second.getByRole('region', { name: 'Приглашение к торговле' })
    const accept = incoming.getByRole('button', { name: 'Начать торговлю', exact: true })
    const firstTrade = first.getByRole('dialog', { name: /^Обмен:/ })
    const secondTrade = second.getByRole('dialog', { name: /^Обмен:/ })
    const secondWhisper = second.getByRole('dialog', { name: /^Шёпот:/ })

    await second.getByRole('button', { name: /^Шёпот:/ }).click()
    await expect(secondWhisper).toBeVisible()

    async function invite(): Promise<string> {
        await socialMenu(first, players.secondId, /^Обменяться:/)
        await expect(outgoing).toContainText(players.secondName)
        await expect(incoming).toContainText(players.firstName)
        await expect(firstTrade).toHaveCount(0)
        await expect(secondTrade).toHaveCount(0)
        await expect(secondWhisper).toBeVisible()
        await expect(outgoing).toBeInViewport({ ratio: 1 })
        await expect(incoming).toBeInViewport({ ratio: 1 })
        await expect
            .poll(() => readExchange(first))
            .toMatchObject({ status: 'invited', incoming: false, partnerId: players.secondId })
        const invitation = (await readExchange(first))!
        await expect
            .poll(() => readExchange(second))
            .toMatchObject({
                id: invitation.id,
                status: 'invited',
                incoming: true,
                partnerId: players.firstId,
            })
        return invitation.id
    }

    async function expectClosed(id: string): Promise<void> {
        await expect.poll(() => readExchange(first)).toMatchObject({ id, status: 'cancelled' })
        await expect.poll(() => readExchange(second)).toMatchObject({ id, status: 'cancelled' })
        await expect(outgoing).toHaveCount(0)
        await expect(incoming).toHaveCount(0)
        await expect(firstTrade).toHaveCount(0)
        await expect(secondTrade).toHaveCount(0)
    }

    const cancelled = await invite()
    await outgoing.getByRole('button', { name: 'Отменить предложение', exact: true }).click()
    await expectClosed(cancelled)

    const declined = await invite()
    expect(declined).not.toBe(cancelled)
    await incoming.getByRole('button', { name: 'Отклонить', exact: true }).click()
    await expectClosed(declined)

    const confirmed = await invite()
    expect(confirmed).not.toBe(declined)
    await accept.click()
    await expect.poll(() => readExchange(first)).toMatchObject({ id: confirmed, status: 'active' })
    await expect.poll(() => readExchange(second)).toMatchObject({ id: confirmed, status: 'active' })
    await expect(outgoing).toHaveCount(0)
    await expect(incoming).toHaveCount(0)
    await expect(firstTrade).toBeVisible()
    await expect(secondTrade).toBeVisible()
    await expect(secondWhisper).toHaveCount(0)
}

function readExchange(page: Page) {
    return page.evaluate(() => window.__ratataTest!.getState().snapshot?.social?.exchange)
}

interface ExchangeFrame {
    page: string
    at: number
    command: Record<string, unknown>
}

async function proposeGift(page: Page, giftId: string, frames: ExchangeFrame[]): Promise<void> {
    const trade = page.getByRole('dialog', { name: /^Обмен:/ })
    await trade.locator(`#exchange-${giftId}`).fill('1')
    await expect(trade.getByRole('button', { name: 'Предложить', exact: true })).toBeEnabled()
    const before = frames.length
    await trade.getByRole('button', { name: 'Предложить', exact: true }).click()
    const proposal = () =>
        frames
            .slice(before)
            .findLast(
                (frame) => frame.page === 'first' && frame.command['type'] === 'exchange_offer'
            )?.command
    await expect.poll(() => proposal()?.['requestId']).toEqual(expect.any(String))
    const requestId = proposal()?.['requestId']
    if (typeof requestId !== 'string') throw new Error('No exchange proposal request ID')
    expect(proposal()?.['items']).toEqual([{ instanceId: giftId, quantity: 1 }])
    await expect
        .poll(() =>
            page.evaluate(() => {
                const own = window.__ratataTest!.getState().snapshot!.social?.exchange?.own
                return {
                    requestId: own?.lastRequestId,
                    requestError: own?.requestError ?? null,
                    itemCount: own?.items.length,
                    items: own?.items.map((item) => ({
                        instanceId: item.instanceId,
                        quantity: item.quantity ?? 1,
                    })),
                }
            })
        )
        .toEqual({
            requestId,
            requestError: null,
            itemCount: 1,
            items: [{ instanceId: giftId, quantity: 1 }],
        })
}

async function openTradePages(browser: Browser, viewport: { width: number; height: number }) {
    const context = await browser.newContext({ viewport })
    const first = await context.newPage()
    const second = await context.newPage()
    const exchangeFrames: ExchangeFrame[] = []
    captureExchangeFrames(first, 'first', exchangeFrames)
    captureExchangeFrames(second, 'second', exchangeFrames)
    return { context, first, second, exchangeFrames }
}

async function attachExchangeFailure(
    info: TestInfo,
    exchangeFrames: ExchangeFrame[],
    first: Page,
    second: Page,
    giftId?: string
): Promise<void> {
    const snapshots = await Promise.allSettled([
        exchangeFailureState(first, giftId),
        exchangeFailureState(second, giftId),
    ])
    await info
        .attach('exchange-failure.json', {
            body: Buffer.from(JSON.stringify({ exchangeFrames, snapshots }, null, 2)),
            contentType: 'application/json',
        })
        .catch(() => undefined)
}

function captureExchangeFrames(page: Page, owner: string, frames: ExchangeFrame[]): void {
    page.on('websocket', (socket) =>
        socket.on('framesent', ({ payload }) => {
            let parsed: unknown
            try {
                parsed = JSON.parse(String(payload))
            } catch {
                return
            }
            if (
                typeof parsed !== 'object' ||
                parsed === null ||
                !('type' in parsed) ||
                typeof parsed.type !== 'string' ||
                !parsed.type.startsWith('exchange_')
            )
                return
            const message = parsed as Record<string, unknown>
            const fields = [
                'type',
                'exchangeId',
                'targetId',
                'revision',
                'requestId',
                'items',
                'gold',
                'accept',
                'reason',
            ]
            frames.push({
                page: owner,
                at: Date.now(),
                command: Object.fromEntries(fields.map((field) => [field, message[field]])),
            })
        })
    )
}

async function exchangeFailureState(page: Page, giftId?: string) {
    return page.evaluate((instanceId) => {
        const state = window.__ratataTest?.getState()
        const exchange = state?.snapshot?.social?.exchange ?? null
        const quantity = instanceId ? document.getElementById(`exchange-${instanceId}`) : null
        return {
            connected: state?.connected,
            exchange,
            position: state?.player?.position,
            gift: state?.player?.inventory
                .filter((item) => item.instanceId === instanceId)
                .map((item) => ({
                    instanceId: item.instanceId,
                    itemId: item.itemId,
                    quantity: item.quantity ?? 1,
                })),
            selectedQuantity: quantity instanceof HTMLInputElement ? quantity.value : null,
            draftStatus: document.querySelector('.exchange-draft-status')?.textContent?.trim(),
        }
    }, giftId)
}

async function assertHudLayout(page: Page): Promise<void> {
    const viewport = page.viewportSize()!
    const status = await page.locator('.game-player-status').boundingBox()
    const hints = await page.locator('.social-hints').boundingBox()
    expect(hints!.y).toBeGreaterThanOrEqual(status!.y + status!.height)
    expect(hints!.x).toBeGreaterThanOrEqual(0)
    expect(hints!.x + hints!.width).toBeLessThanOrEqual(viewport.width)
    expect(hints!.y + hints!.height).toBeLessThanOrEqual(viewport.height)
    const target = await page.getByLabel('Выбранная цель', { exact: true }).boundingBox()
    if (viewport.width <= 740 && target)
        expect(target.y).toBeGreaterThanOrEqual(hints!.y + hints!.height)
}
