import type { GameEventPayload, ServerMessage } from '@my-game-ratata/contracts'
import { expect, type Locator, type Page, test } from '@playwright/test'

import { enterBuilding, walkTo } from './world-navigation'
import { clickVisibleCharacter, selectedWorldTarget } from './world-target-ui'

async function selectVisibleAlly(page: Page, name: string): Promise<void> {
    const limit = await page.evaluate(() => {
        return Math.min(256, window.__ratataTest!.observe().targets.length + 1)
    })
    const selected = selectedWorldTarget(page)
    for (let count = 0; count < limit; count += 1) {
        await page.keyboard.press('Tab')
        if ((await selected.getAttribute('data-selected-target-name')) === name) break
    }
    await expect(selected).toHaveAttribute('data-selected-target-name', name)
}

test('keeps a model conversation and merchant service usable by keyboard', async ({ page }) => {
    test.setTimeout(90_000)
    const voicedDialogue = captureNpcDialogue(page)
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.evaluate(() => window.__ratataTest!.join('speech-merchant'))
    await enterBuilding(page, 'Лавка')
    await page.waitForFunction(() =>
        window
            .__ratataTest!.getState()
            .snapshot?.characters.some(({ id }) => id === 'npc_merchant_1')
    )
    const merchant = await page.evaluate(
        () =>
            window
                .__ratataTest!.getState()
                .snapshot!.characters.find(({ id }) => id === 'npc_merchant_1')!.position
    )
    await walkTo(page, merchant, 20)
    await page.evaluate(() =>
        window.__ratataTest!.send({ type: 'interact', targetId: 'npc_merchant_1' })
    )
    const dialogue = page.getByRole('dialog', { name: /Разговор:.*Савва/ })
    await expect(dialogue).toBeVisible()
    const speechBadge = dialogue.locator('.soul-badge__speech')
    await expect(speechBadge).toHaveText('Есть речь')
    await expect(speechBadge.locator('.soul-speech-icon')).toBeVisible()
    const input = dialogue.getByRole('textbox', { name: 'Реплика собеседнику' })
    await expect(page.locator('.speech-text')).toContainText('Я слушаю.')
    const reply = page.locator('.speech-bubble').filter({ hasText: 'Я слушаю.' })
    const speech = await page.evaluate(
        () => window.__ratataTest!.getState().snapshot!.adventure!.dialogue!
    )
    await expect
        .poll(() => voicedDialogue)
        .toContainEqual(
            expect.objectContaining({
                actorId: speech.npcId,
                kind: 'chat',
                speechId: speech.speechId,
                text: speech.text,
            })
        )
    await expect(page.locator('.speech-layer').getByText(speech.text, { exact: true })).toHaveCount(
        1
    )
    const firstReceipt = await reply.getAttribute('id')
    await input.fill('Что ты продаёшь?')
    await expect(dialogue.getByRole('button', { name: 'Отправить' })).toBeEnabled()
    await input.press('Enter')
    await expect(input).toHaveValue('')
    await expect(reply).not.toHaveAttribute('id', firstReceipt!)
    await expect(reply).toBeVisible()
    await page.keyboard.press('PageDown')
    await expect(reply.locator('.speech-text')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialogue).toHaveCount(0)
    await page.evaluate(() =>
        window.__ratataTest!.send({ type: 'interact', targetId: 'npc_merchant_1', service: 'shop' })
    )
    await expect(page.getByRole('heading', { name: 'Товары' })).toBeVisible()
})

async function talkThroughActionMenu(
    page: Page,
    prompt: Locator,
    name: string,
    mobile: boolean
): Promise<void> {
    if (mobile) await prompt.click()
    else await openGuardMenuWithMouse(page, name)
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await expect(
        menu.getByRole('menuitem', { name: `Попросить идти вместе: ${name}`, exact: true })
    ).toHaveCount(0)
    await expect(
        menu.getByRole('menuitem', { name: `Попросить помочь в бою: ${name}`, exact: true })
    ).toHaveCount(0)
    const talk = menu.getByRole('menuitem', { name: `Поговорить: ${name}`, exact: true })
    await expect(talk).toBeEnabled()
    const limit = await menu.getByRole('menuitem').count()
    await page.keyboard.press('Home')
    for (let count = 0; count < limit; count += 1) {
        if (await talk.evaluate((element) => element === document.activeElement)) break
        await page.keyboard.press('ArrowDown')
    }
    await expect(talk).toBeFocused()
    await page.keyboard.press('Enter')
}

async function openGuardMenuWithMouse(page: Page, name: string): Promise<void> {
    const selected = selectedWorldTarget(page)
    await page.keyboard.press('Escape')
    await expect(selected).toHaveCount(0)
    await clickVisibleCharacter(page, 'npc_guard_1', 1)
    await expect(selected).toHaveAttribute('data-selected-target-name', name)
    await expect(page.getByRole('menu')).toHaveCount(0)
    await clickVisibleCharacter(page, 'npc_guard_1', 2)
}

function captureNpcDialogue(page: Page): GameEventPayload[] {
    const lines: GameEventPayload[] = []
    page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname !== '/ws') return
        socket.on('framereceived', ({ payload }) => {
            if (typeof payload !== 'string') return
            const message = JSON.parse(payload) as ServerMessage
            if (message.type === 'event' && message.event.voice === 'dialogue') {
                lines.push(message.event)
            }
        })
    })
    return lines
}

for (const mobile of [false, true]) {
    test(`a scripted guard types then hums without opening a conversation (${mobile ? 'mobile' : 'desktop'})`, async ({
        page,
    }, info) => {
        test.setTimeout(90_000)
        await page.setViewportSize(
            mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
        )
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate(async ({ name }) => window.__ratataTest!.join(name, 'cleric'), {
            name: `speech-${info.project.name}-${mobile}`,
        })
        // The generated guard post can be inside the guild. Enter by its real doorway first.
        await enterBuilding(page, 'Гильдия искателей')
        await expect
            .poll(() =>
                page.evaluate(() =>
                    window
                        .__ratataTest!.observe()
                        .targets.some((target) => target.id === 'npc_guard_1')
                )
            )
            .toBe(true)
        const guard = await page.evaluate(
            () =>
                window
                    .__ratataTest!.observe()
                    .targets.find((target) => target.id === 'npc_guard_1')!.position
        )
        await walkTo(page, guard, 32)
        await expect(page.getByRole('button', { name: 'Спутники', exact: true })).toHaveCount(0)
        const guardName = await page.evaluate(
            () =>
                window
                    .__ratataTest!.getState()
                    .snapshot!.characters.find((actor) => actor.id === 'npc_guard_1')!.nickname
        )
        await page.locator('canvas[data-game-canvas=true]').focus()
        await page.keyboard.press('KeyQ')
        const hotbar = page.locator('.hotbar-content')
        const guide = hotbar.getByText('Q себя', { exact: false })
        const prompt = hotbar.getByRole('button', { name: /^F / })
        await expect(guide).toBeVisible()
        await expect(prompt).toHaveCount(0)
        await page.keyboard.press('KeyE')
        const selfId = await page.evaluate(() => window.__ratataTest!.getState().localPlayerId)
        await expect(selectedWorldTarget(page)).toHaveAttribute(
            'data-selected-target-key',
            `character:${selfId}`
        )
        await selectVisibleAlly(page, guardName)
        await expect(prompt).toBeVisible()
        await expect(prompt).toContainText(guardName)
        await expect(guide).toBeHidden()
        const [promptBounds, trayBounds] = await Promise.all([
            prompt.boundingBox(),
            hotbar.getByRole('group', { name: 'Быстрые действия' }).boundingBox(),
        ])
        expect(promptBounds!.y + promptBounds!.height).toBeLessThanOrEqual(trayBounds!.y)
        await talkThroughActionMenu(page, prompt, guardName, mobile)
        const dialogue = page.getByRole('dialog', { name: /Разговор:.*Рада/ })
        const pending = page.getByRole('img', { name: `${guardName} печатает` })
        const speech = page.locator('.speech-text').filter({ hasText: /^М-м-м-м-м…$/u })
        await expect(dialogue).toHaveCount(0)
        await expect(pending).toBeVisible()
        await expect(speech).toHaveCount(0)
        await expect(speech).toBeVisible()
        await expect(pending).toHaveCount(0)
        const bounds = await page.locator('.speech-bubble').boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(12)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual((mobile ? 390 : 1280) - 12)
        await page.keyboard.press('Escape')
        await expect(dialogue).toHaveCount(0)
    })
}
