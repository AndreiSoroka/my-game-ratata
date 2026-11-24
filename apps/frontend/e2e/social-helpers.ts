import { expect as baseExpect, type Page } from '@playwright/test'

import { selectedWorldTarget } from './world-target-ui'

export const socialExpect = baseExpect.configure({ timeout: 10_000 })
const expect = socialExpect

export async function joinSocial(page: Page, nickname: string): Promise<string> {
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.evaluate((name) => window.__ratataTest!.join(name, 'vanguard'), nickname)
    await expect(page.locator('canvas[data-game-canvas=true]')).toBeVisible()
    return page.evaluate(() => window.__ratataTest!.getState().localPlayerId!)
}

export async function gatherGift(page: Page): Promise<string> {
    const node = await page.evaluate(() =>
        window
            .__ratataTest!.getState()
            .snapshot!.adventure!.resourceNodes.find(
                (entry) => entry.kind === 'fiber' && entry.remaining > 0
            )!
    )
    expect(node).toBeDefined()
    const navigation = await page.evaluate(
        (position) => window.__ratataTest!.navigate(position, { tolerance: 30, timeoutMs: 25_000 }),
        node.position
    )
    expect(navigation.status).toBe('arrived')
    await page.evaluate((nodeId) => window.__ratataTest!.send({ type: 'gather', nodeId }), node.id)
    await socialExpect
        .poll(() =>
            page.evaluate(() =>
                window
                    .__ratataTest!.getState()
                    .player!.inventory.some((item) => item.itemId === 'fiber')
            )
        )
        .toBe(true)
    return page.evaluate(
        () =>
            window
                .__ratataTest!.getState()
                .player!.inventory.find((item) => item.itemId === 'fiber')!.instanceId
    )
}

export async function approachGiftPartner(
    first: Page,
    second: Page,
    useMouse: boolean
): Promise<void> {
    const position = await first.evaluate(() => window.__ratataTest!.getState().player!.position)
    const arrival = await second.evaluate(
        ({ position, useMouse }) => {
            const api = window.__ratataTest!
            if (!useMouse) return api.navigate(position, { tolerance: 20, timeoutMs: 25_000 })
            // Stage the click-to-approach case at a point outside whisper reach.
            const start = api.getState().player!.position
            const dx = start.x - position.x
            const dy = start.y - position.y
            const scale = 80 / Math.max(1, Math.hypot(dx, dy))
            const approach = { x: position.x + dx * scale, y: position.y + dy * scale }
            return api.navigate(approach, { tolerance: 12, timeoutMs: 25_000 })
        },
        { position, useMouse }
    )
    expect(arrival.status).toBe('arrived')
}

export async function selectSocialTarget(page: Page, id: string): Promise<void> {
    const name = await page.evaluate(
        (targetId) =>
            window
                .__ratataTest!.getState()
                .snapshot!.characters.find((actor) => actor.id === targetId)!.nickname,
        id
    )
    const selected = selectedWorldTarget(page)
    const limit = await page.evaluate(() => window.__ratataTest!.observe().targets.length + 1)
    for (let count = 0; count < limit; count += 1) {
        await page.keyboard.press('Tab')
        if ((await selected.getAttribute('data-selected-target-name')) === name) break
    }
    await expect(selected).toHaveAttribute('data-selected-target-name', name)
}

export async function socialMenu(page: Page, id: string, action: RegExp): Promise<void> {
    await page.locator('canvas[data-game-canvas=true]').focus()
    await selectSocialTarget(page, id)
    await page.keyboard.press('KeyF')
    await page.getByRole('menuitem', { name: action }).click()
}

export async function expectGiftSettlement(
    first: Page,
    second: Page,
    giftId: string
): Promise<void> {
    await socialExpect
        .poll(() =>
            first.evaluate(() => window.__ratataTest!.getState().snapshot!.social?.exchange?.status)
        )
        .toBe('completed')
    await socialExpect
        .poll(() =>
            second.evaluate(
                (instanceId) =>
                    window
                        .__ratataTest!.getState()
                        .player!.inventory.some((item) => item.instanceId === instanceId),
                giftId
            )
        )
        .toBe(true)
    expect(
        await first.evaluate(
            (instanceId) =>
                window
                    .__ratataTest!.getState()
                    .player!.inventory.some((item) => item.instanceId === instanceId),
            giftId
        )
    ).toBe(false)
    expect(
        await first.evaluate(
            () => window.__ratataTest!.getState().snapshot!.social?.exchange?.receiptId
        )
    ).toBeTruthy()
    await second.evaluate(
        (itemInstanceId) =>
            window.__ratataTest!.send({ type: 'inventory_action', action: 'drop', itemInstanceId }),
        giftId
    )
}

export async function captureExchange(page: Page, name: string): Promise<void> {
    const trade = page.getByRole('dialog', { name: /^Обмен:/ })
    await expect(trade.getByRole('img', { name: 'Вы: подтверждено', exact: true })).toBeVisible()
    const input = await trade.getByPlaceholder('Сообщение собеседнику').boundingBox()
    const chat = await trade.getByLabel('Приватный разговор').boundingBox()
    const actions = await trade.locator('.exchange-actions').boundingBox()
    const panel = await trade.boundingBox()
    expect(input!.y + input!.height).toBeLessThanOrEqual(chat!.y + chat!.height + 1)
    expect(actions!.y + actions!.height).toBeLessThanOrEqual(panel!.y + panel!.height + 1)
    await expect(page.locator('.game-notice')).toHaveCount(0, { timeout: 6500 })
    await page.screenshot({ path: `/private/tmp/ratata-trade-${name}.png` })
}
