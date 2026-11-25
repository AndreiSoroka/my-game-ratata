import process from 'node:process'

import { ITEM_DEFINITIONS } from '@my-game-ratata/contracts'
import { expect, type Locator, type Page, test, type ViewportSize } from '@playwright/test'

import { joinSocial, selectSocialTarget, socialMenu } from './social-helpers'
import {
    abandonGuildContract,
    openObservedWorkerOffer,
    whisperQuestRequest,
} from './worker-contract-helpers'
import { approachBuilding, enterBuilding, walkTo } from './world-navigation'

const scenarios = [
    {
        name: 'desktop',
        viewport: { width: 1280, height: 800 },
        workerMode: 'submitter',
        workerLabel: 'Вся награда сдающему',
        guildMode: 'party_equal',
        guildLabel: 'Поровну группе',
        requestTurnIn: whisperQuestRequest,
    },
    {
        name: 'mobile',
        viewport: { width: 390, height: 844 },
        workerMode: 'party_equal',
        workerLabel: 'Поровну группе',
        guildMode: 'submitter',
        guildLabel: 'Вся награда сдающему',
        requestTurnIn: nearbyQuestRequest,
    },
]
for (const scenario of scenarios) {
    if (process.env['E2E_BOARD_DELIVERY'] === '1') {
        test(`completes a board delivery from the chat turn-in window (${scenario.name})`, async ({
            page,
        }) => {
            test.setTimeout(120_000)
            // Prepare the delivery with the standard camera before exercising the quest UI.
            await page.setViewportSize({ width: 1280, height: 800 })
            await joinSocial(page, `board-delivery-${scenario.name}`)
            const brushwood = await gatherBoardDelivery(page)
            await page.setViewportSize(scenario.viewport)
            const title = 'Хворост для городского склада'
            const board = await readQuestBoard(page)
            await expect(board.getByText(title, { exact: true })).toBeVisible({ timeout: 15_000 })
            await page.keyboard.press('Escape')
            await expect(board).toBeHidden()
            const miraId = await approachMira(page)
            const before = await page.evaluate(() => window.__ratataTest!.getState().snapshot!)
            expect(before.social?.quest).toBeFalsy()
            await scenario.requestTurnIn(page, miraId, `Хочу сдать «${title}»`)
            const prompt = page.getByRole('dialog', { name: 'Сдать поручение', exact: true })
            await expect(prompt.getByRole('heading', { name: title, exact: true })).toBeVisible()
            expect(
                await page.evaluate(
                    () =>
                        window.__ratataTest!.getState().snapshot?.social?.questTurnIn?.preAcceptance
                )
            ).toBe(true)
            await expect(prompt.getByText('Хворост × 1', { exact: true })).toBeVisible()
            await expect(prompt.getByText('Общая награда: 5 золотых')).toBeVisible()
            await prompt.getByRole('radio', { name: 'Вся награда сдающему' }).press('KeyF')
            await prompt.getByRole('button', { name: 'Сдать', exact: true }).click()
            await expect(prompt).toBeHidden()
            await expect
                .poll(() =>
                    page.evaluate((instanceId) => {
                        const state = window.__ratataTest!.getState()
                        return {
                            gold: state.snapshot?.adventure?.gold,
                            hasBrushwood: state.player?.inventory.some(
                                (item) => item.instanceId === instanceId
                            ),
                        }
                    }, brushwood)
                )
                .toEqual({ gold: before.adventure!.gold + 5, hasBrushwood: false })
            await expect(
                page.getByText('Награда за задание: 5 золотых.', { exact: true })
            ).toBeVisible()
            const game = await page.evaluate(async () => {
                const api = window.__ratataTest!
                const tick = api.getState().snapshot!.tick
                const heartbeat = await api.waitFor({ type: 'tick', after: tick + 5 })
                return { status: heartbeat.status, connected: api.getState().connected }
            })
            expect(game).toEqual({ status: 'condition_met', connected: true })
        })
    }

    test(`fixes worker and guild reward sharing through ordinary UI (${scenario.name})`, async ({
        page,
    }, info) => {
        test.setTimeout(120_000)
        await page.setViewportSize(scenario.viewport)
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate(
            (name) => window.__ratataTest!.join(name, 'ranger'),
            `qr-${info.workerIndex}-${scenario.name[0]}-${Date.now().toString(36)}`
        )
        const board = await readQuestBoard(page)
        await expect(board.getByText('Зачистка троп', { exact: true })).toBeVisible()
        await expect(board.getByRole('button', { name: 'Взять', exact: true })).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(board).toBeHidden()
        const miraId = await approachMira(page)
        const { workerMode, guildMode } = scenario
        await socialMenu(page, miraId, /^Городские дела$/u)
        const cityAffairs = page.getByRole('dialog', { name: 'Разговор: Mira' })
        await cityAffairs.getByRole('button', { name: 'Что нужно городу? Спрос и запасы' }).click()
        await expect(
            cityAffairs.getByRole('heading', { name: 'Спрос города', exact: true })
        ).toBeVisible()
        await page.keyboard.press('Escape')
        await page.keyboard.press('Escape')
        await expect(cityAffairs).toHaveCount(0)
        await openObservedWorkerOffer(page, miraId)
        const offer = page.getByRole('dialog', { name: 'Предложение поручения', exact: true })
        await expect(offer).toBeVisible()
        await expect(offer.getByText('из городского фонда')).toBeVisible()
        await assertCenteredViewport(offer)
        await verifyWorkerObjective(page, offer)
        await verifyFramedRewardChoice(offer)
        await verifyQuestWhisper(offer, info.outputPath(`quest-offer-whisper-${scenario.name}.png`))
        await verifyScrollHint(page, offer, scenario.viewport)
        await expect(offer.getByRole('radio', { name: 'Поровну группе' })).toBeChecked()
        await offer.getByRole('radio', { name: scenario.workerLabel }).focus()
        await page.keyboard.press('KeyF')
        await expect(offer.locator(`input[value="${workerMode}"]`)).toBeChecked()
        // WASD changes the reward option when a radio has focus.
        await offer.getByRole('button', { name: 'Взять', exact: true }).focus()
        await expectStationaryWithKey(page, 'KeyD')
        await expect(offer.locator(`input[value="${workerMode}"]`)).toBeChecked()
        await offer.getByRole('button', { name: 'Взять', exact: true }).focus()
        await page.keyboard.press('Enter')
        await expect
            .poll(() =>
                page.evaluate(() => window.__ratataTest!.getState().snapshot?.party?.activeJob)
            )
            .toMatchObject({ status: 'active', rewardMode: workerMode })
        await expect(offer).toBeHidden()
        await expect(page.locator('canvas[data-game-canvas=true]')).toBeFocused()
        const workerInstance = await page.evaluate(
            () => window.__ratataTest!.getState().snapshot!.party!.activeJob!.instanceId
        )
        try {
            await whisperQuestRequest(page, miraId, 'Я сделал задание')
            const whisper = page.getByRole('dialog', { name: /^Шёпот:/u })
            await expect(whisper).toContainText('Для доклада нужен свободный трофей')
            await page.keyboard.press('Escape')
            const character = await openQuestJournal(page)
            const journal = character.getByRole('region', { name: 'Активные квесты' })
            await expect(journal).toBeVisible()
            await expect(journal).toContainText(scenario.workerLabel)
            await expect(journal.getByRole('radio')).toHaveCount(0)
            await assertFitsViewport(character)
            await page.screenshot({
                path: info.outputPath(`worker-rewards-${scenario.name}.png`),
            })
            await page.keyboard.press('Escape')
            await expect(journal).toBeHidden()
        } finally {
            await abandonGuildContract(page, workerInstance)
        }
        const reviewGuildOffer = () =>
            whisperQuestRequest(page, miraId, 'Хочу взять «Зачистка троп»')
        await whisperQuestRequest(page, miraId, 'Дай что-нибудь простое')
        await expect(offer.getByRole('heading', { name: 'Зачистка троп' })).toBeVisible()
        await expect(offer.getByText('из городского фонда')).toHaveCount(0)
        await assertCenteredViewport(offer)
        await verifyFramedRewardChoice(offer)
        await offer.getByRole('button', { name: 'Отказаться', exact: true }).click()
        await expect(offer).toBeHidden()
        await expect
            .poll(() =>
                page.evaluate(
                    () => window.__ratataTest!.getState().snapshot?.party?.activeJob?.status
                )
            )
            .not.toBe('active')

        await reviewGuildOffer()
        await offer.getByRole('radio', { name: scenario.guildLabel }).focus()
        await page.keyboard.press('KeyF')
        await expect(offer.locator(`input[value="${guildMode}"]`)).toBeChecked()
        await offer.getByRole('button', { name: 'Взять', exact: true }).focus()
        await page.keyboard.press('Enter')
        await expect
            .poll(() =>
                page.evaluate(() => window.__ratataTest!.getState().snapshot?.party?.activeJob)
            )
            .toMatchObject({ id: 'slime_hunt', rewardMode: guildMode, status: 'active' })
        const guildInstance = await page.evaluate(
            () => window.__ratataTest!.getState().snapshot!.party!.activeJob!.instanceId
        )
        try {
            const character = await openQuestJournal(page)
            await character.getByRole('button', { name: /Зачистка троп/ }).click()
            const active = character.getByRole('article', { name: 'Общий контракт' })
            await expect(active).toContainText(scenario.guildLabel)
            await expect(active.getByRole('radio')).toHaveCount(0)
            await assertFitsViewport(character)
            await page.screenshot({
                path: info.outputPath(`guild-rewards-${scenario.name}.png`),
            })
        } finally {
            await abandonGuildContract(page, guildInstance)
        }
    })
}

async function nearbyQuestRequest(page: Page, miraId: string, text: string): Promise<void> {
    await page.locator('canvas[data-game-canvas=true]').focus()
    await selectSocialTarget(page, miraId)
    await page.keyboard.press('Enter')
    const nearby = page.getByRole('textbox', { name: 'Сообщение в чат' })
    await nearby.fill(text)
    await nearby.press('Enter')
}

async function gatherBoardDelivery(page: Page): Promise<string> {
    const branch = () =>
        page.evaluate(
            () =>
                window
                    .__ratataTest!.observe()
                    .targets.filter(
                        ({ details, kind }) =>
                            kind === 'resource' &&
                            details['source'] === 'branches' &&
                            Number(details['remaining']) > 0
                    )
                    .sort((a, b) => a.distance - b.distance)[0]
        )
    await expect.poll(branch).toBeTruthy()
    const source = (await branch())!
    const gathered = await page.evaluate(async ({ position, id }) => {
        const api = window.__ratataTest!
        const approach = await api.navigate(position, { timeoutMs: 20_000, tolerance: 24 })
        if (approach.status !== 'arrived') return approach
        return api.act(
            { type: 'auto_action', action: { kind: 'gather', nodeId: id } },
            { until: { type: 'inventory', itemId: 'brushwood', atLeast: 1 } }
        )
    }, source)
    expect(gathered.status, gathered.reason).toBe('condition_met')
    return page.evaluate(
        () =>
            window
                .__ratataTest!.getState()
                .player!.inventory.find(({ itemId }) => itemId === 'brushwood')!.instanceId
    )
}

async function verifyWorkerObjective(page: Page, offer: Locator): Promise<void> {
    const items = await page.evaluate(
        () =>
            window
                .__ratataTest!.getState()
                .snapshot?.social?.questOffer?.objectives.filter(
                    ({ kind }) => kind === 'deliver'
                ) ?? []
    )
    expect(items).toHaveLength(1)
    for (const { itemId, quantity } of items) {
        const item = offer.getByRole('listitem').filter({
            has: page.getByText(`${ITEM_DEFINITIONS[itemId].name} × ${quantity}`, {
                exact: true,
            }),
        })
        await expect(item.locator('img')).toHaveJSProperty('naturalWidth', 16)
    }
}

async function verifyFramedRewardChoice(offer: Locator): Promise<void> {
    const choice = offer.getByRole('group', { name: 'Распределение награды' })
    await expect(choice.locator('[data-fantasy-border="border-006"]')).toBeVisible()
    await expect(choice.locator('[data-fantasy-border="border-001"]')).toHaveCount(2)
}

async function verifyScrollHint(page: Page, offer: Locator, viewport: ViewportSize): Promise<void> {
    const terms = offer.getByRole('region', { name: 'Условия поручения' })
    const hint = offer.getByText('Прокрутите вниз', { exact: false })
    await page.setViewportSize({ ...viewport, height: 480 })
    try {
        await expect(hint).toBeVisible()
        await expect(offer.getByRole('button', { name: 'Взять', exact: true })).toBeInViewport()
        await terms.press('End')
        await expect(hint).toBeHidden()
        await terms.press('Home')
        await expect(hint).toBeVisible()
    } finally {
        await page.setViewportSize(viewport)
    }
}

async function verifyQuestWhisper(offer: Locator, screenshotPath: string): Promise<void> {
    const questFrame = offer.locator('.quest-decision')
    const whisper = offer.getByRole('region', { name: 'Приватный разговор' })
    await expect(questFrame.getByRole('region', { name: 'Приватный разговор' })).toHaveCount(0)
    await expect(whisper).toBeInViewport({ ratio: 1 })
    const [questBox, whisperBox] = await Promise.all([
        questFrame.boundingBox(),
        whisper.boundingBox(),
    ])
    expect(questBox!.y + questBox!.height).toBeLessThan(whisperBox!.y)
    const whisperInput = whisper.getByRole('textbox', { name: 'Сказать шёпотом' })
    await whisperInput.fill('Спасибо за пояснение.')
    await whisperInput.press('Enter')
    await expect(whisper.getByRole('list', { name: 'История шёпота' })).toContainText(
        'Спасибо за пояснение.'
    )
    await expect(whisperInput).toBeFocused()
    await expect(whisperInput).toHaveValue('')
    await expect(offer).toBeVisible()
    await offer.screenshot({ path: screenshotPath })
}

async function openQuestJournal(page: Page): Promise<Locator> {
    await page.locator('canvas[data-game-canvas=true]').focus()
    await page.keyboard.press('KeyP')
    const character = page.getByRole('dialog', { name: 'Персонаж', exact: true })
    await character.getByRole('tab', { name: 'Квесты', exact: true }).click()
    return character
}

async function readQuestBoard(page: Page): Promise<Locator> {
    const objectId = 'novogorod:quest-board'
    await approachBuilding(page, 'Гильдия искателей')
    await expect
        .poll(() =>
            page.evaluate(
                (id) => window.__ratataTest!.observe().targets.some((t) => t.id === id),
                objectId
            )
        )
        .toBe(true)
    const result = await page.evaluate(async (id) => {
        const api = window.__ratataTest!
        const approach = await api.navigate({ targetKey: `world:${id}` }, { timeoutMs: 30_000 })
        if (approach.status === 'arrived') api.send({ type: 'world_interact', objectId: id })
        return approach
    }, objectId)
    expect(result.status, result.reason).toBe('arrived')
    const board = page.getByRole('dialog', { name: 'Доска заказов', exact: true })
    await expect(board).toBeVisible()
    return board
}

async function approachMira(page: Page): Promise<string> {
    await enterBuilding(page, 'Гильдия искателей')
    await expect
        .poll(() =>
            page.evaluate(() =>
                window
                    .__ratataTest!.observe()
                    .targets.some((target) => target.kind === 'character' && target.name === 'Mira')
            )
        )
        .toBe(true)
    const mira = await page.evaluate(() =>
        window
            .__ratataTest!.observe()
            .targets.find((target) => target.kind === 'character' && target.name === 'Mira')!
    )
    await walkTo(page, mira.position, 32)
    return mira.id
}

async function expectStationaryWithKey(page: Page, code: string): Promise<void> {
    const before = await page.evaluate(() => ({
        position: window.__ratataTest!.getState().player!.position,
        tick: window.__ratataTest!.getState().snapshot!.tick,
    }))
    await page.keyboard.down(code)
    try {
        const waited = await page.evaluate(
            (tick) => window.__ratataTest!.waitFor({ type: 'tick', after: tick + 4 }),
            before.tick
        )
        expect(waited.status).toBe('condition_met')
    } finally {
        await page.keyboard.up(code)
    }
    const after = await page.evaluate(() => window.__ratataTest!.getState().player!.position)
    expect(
        Math.hypot(after.x - before.position.x, after.y - before.position.y)
    ).toBeLessThanOrEqual(1)
}

async function assertFitsViewport(panel: ReturnType<Page['locator']>): Promise<void> {
    const geometry = await panel.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return {
            left: bounds.left,
            right: bounds.right,
            width: window.innerWidth,
            overflow: element.scrollWidth > element.clientWidth,
        }
    })
    expect(geometry.left).toBeGreaterThanOrEqual(0)
    expect(geometry.right).toBeLessThanOrEqual(geometry.width)
    expect(geometry.overflow).toBe(false)
}

async function assertCenteredViewport(panel: Locator): Promise<void> {
    await assertFitsViewport(panel)
    const offset = await panel.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return {
            x: bounds.left + (bounds.width - window.innerWidth) / 2,
            y: bounds.top + (bounds.height - window.innerHeight) / 2,
        }
    })
    expect(Math.abs(offset.x)).toBeLessThanOrEqual(2)
    expect(Math.abs(offset.y)).toBeLessThanOrEqual(2)
}
