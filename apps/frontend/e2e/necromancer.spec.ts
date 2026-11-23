import {
    type MovementMode,
    type Vector2,
    WESTERN_RUINS_LOCATION_ID,
} from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

import { selectedWorldTarget } from './world-target-ui'

interface RuinsMap {
    layers: { name: string; objects?: (Vector2 & { type: string })[] }[]
}

const savvaId = 'npc_necromancer_1'

test('chats with Savva and learns the Ash prayer before hostilities', async ({ page }, info) => {
    test.setTimeout(150_000)
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.addStyleTag({ content: '.test-panel { display: none !important }' })
    await page
        .getByRole('textbox', { name: 'Имя героя' })
        .fill(`ash-${info.workerIndex}-${Date.now().toString(36)}`)
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    await page.waitForFunction(
        () => {
            const state = window.__ratataTest?.getState()
            return state?.mapReady === true && state.player?.alive === true
        },
        undefined,
        { timeout: 15_000 }
    )

    const ruinsMap = page.waitForResponse(
        (response) => {
            const path = new URL(response.url()).pathname
            return (
                path.startsWith('/world/maps/') &&
                path.endsWith(`/${WESTERN_RUINS_LOCATION_ID}.json`)
            )
        },
        { timeout: 65_000 }
    )
    await travelToRuins(page)
    const map: RuinsMap = await (await ruinsMap).json()
    const refuge = map.layers
        .find(({ name }) => name === 'Ash refuge')
        ?.objects?.find(({ type }) => type === 'ash_home')
    expect(refuge).toBeDefined()
    await changeMovement(page, 'sneaking')
    await approachTeacher(page, refuge!)
    await learnAshPrayer(page)
})

async function travelToRuins(page: Page): Promise<void> {
    for (let crossing = 0; crossing < 2; crossing += 1) {
        expect(
            await page.evaluate(() => window.__ratataTest!.travel('west', { timeoutMs: 30_000 }))
        ).toMatchObject({ status: 'arrived' })
    }
    await expect
        .poll(() => page.evaluate(() => window.__ratataTest!.getState().snapshot?.location?.id))
        .toBe(WESTERN_RUINS_LOCATION_ID)
}

async function learnAshPrayer(page: Page): Promise<void> {
    await expect
        .poll(() =>
            page.evaluate(
                (id) =>
                    window
                        .__ratataTest!.getState()
                        .snapshot?.characters.find((actor) => actor.id === id),
                savvaId
            )
        )
        .toMatchObject({ visualId: 'necromancer', relationship: 'friendly' })
    await changeMovement(page, 'walking')
    await waitForLesson(page)

    const chat = page.locator('.game-chat')
    await chat.getByRole('button', { name: 'Развернуть историю чата' }).click()
    await chat.getByRole('button', { name: 'Рядом', exact: true }).click()
    const replies = chat
        .getByRole('listitem')
        .filter({ hasText: /^Савва:\s*Я слушаю\. Чем тебе помочь\?$/u })
    await expect(selectedWorldTarget(page)).toHaveCount(0)
    await greetNearby(page)
    await expect(replies).toHaveCount(1)

    await selectSavva(page)
    await greetNearby(page)
    await expect(replies).toHaveCount(2)
    await chat.getByRole('button', { name: 'Личные', exact: true }).click()
    await expect(replies).toHaveCount(0)
    await page.locator('canvas[data-game-canvas=true]').focus()
    await waitForLesson(page)
    await page.keyboard.press('KeyF')
    await expect(page.getByRole('menuitem', { name: /^Поговорить:/u })).toHaveCount(0)
    const lesson = page.getByRole('menuitem', { name: 'Изучить: Молитва праха', exact: true })
    await expect(lesson).toBeVisible()
    await lesson.dispatchEvent('click', undefined, { timeout: 2_000 })
    await expect
        .poll(() => page.evaluate(() => window.__ratataTest!.getState().player?.abilities?.known))
        .toContain('pray_grave')
    await expect
        .poll(() =>
            page.evaluate(() => window.__ratataTest!.getState().player?.progression?.deity.id)
        )
        .toBe('grave')
    const sourceImage = await page.request.get('/game/assets/characters/necromancer.png')
    expect(sourceImage.ok()).toBe(true)
    expect(sourceImage.headers()['content-type']).toContain('image/png')

    await chat.getByRole('button', { name: 'Рядом', exact: true }).click({ timeout: 5_000 })
}

async function greetNearby(page: Page): Promise<void> {
    await sendNearby(page, 'привет')
}

async function sendNearby(page: Page, text: string): Promise<void> {
    await page.locator('canvas[data-game-canvas=true]').focus()
    await page.keyboard.press('Enter')
    const input = page.getByRole('textbox', { name: 'Сообщение в чат' })
    await input.fill(text)
    await input.press('Enter')
    await expect(input).toHaveCount(0)
}

async function approachTeacher(page: Page, home: Vector2): Promise<void> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
        if (await canLearnPrayer(page)) return
        const { player, teacher } = await page.evaluate((id) => {
            const state = window.__ratataTest!.getState()
            return {
                player: state.player!.position,
                teacher: state.snapshot!.characters.find((actor) => actor.id === id)!.position,
            }
        }, savvaId)
        const from = Math.atan2(player.y - home.y, player.x - home.x)
        const deltaX = teacher.x - home.x
        const deltaY = teacher.y - home.y
        const teacherRadius = Math.hypot(deltaX, deltaY)
        const to = teacherRadius > 8 ? Math.atan2(deltaY, deltaX) : from
        const turn = Math.atan2(Math.sin(to - from), Math.cos(to - from))
        const ringSteps = Math.ceil(Math.abs(turn) / (Math.PI / 4))
        if (ringSteps > 1) {
            for (let step = 0; step <= ringSteps; step += 1) {
                const angle = from + (turn * step) / ringSteps
                await navigateTo(page, onRing(home, angle, 64), 9)
            }
        }
        if (teacherRadius >= 80) {
            await navigateTo(page, teacher, 24)
        } else {
            await navigateTo(page, onRing(home, to, Math.max(43, teacherRadius + 12)), 7)
        }
    }
}

function onRing(home: Vector2, angle: number, radius: number): Vector2 {
    return { x: home.x + radius * Math.cos(angle), y: home.y + radius * Math.sin(angle) }
}

async function changeMovement(page: Page, mode: MovementMode): Promise<void> {
    await page.evaluate((mode) => window.__ratataTest!.send({ type: 'movement_mode', mode }), mode)
    await page.waitForFunction(
        (mode) => window.__ratataTest?.getState().player?.movement?.mode === mode,
        mode,
        { timeout: 5_000 }
    )
}

async function navigateTo(page: Page, position: Vector2, tolerance: number): Promise<void> {
    const reached = await page.evaluate(
        ({ position, tolerance }) =>
            window.__ratataTest!.navigate(position, { timeoutMs: 45_000, tolerance }),
        { position, tolerance }
    )
    expect(reached).toMatchObject({ status: 'arrived' })
}

async function selectSavva(page: Page): Promise<void> {
    const selected = selectedWorldTarget(page)
    const count = await page.evaluate(() => window.__ratataTest!.observe().targets.length + 1)
    for (let index = 0; index < count; index += 1) {
        await page.keyboard.press('Tab')
        if ((await selected.getAttribute('data-selected-target-name')) === 'Савва') break
    }
    await expect(selected).toHaveAttribute('data-selected-target-name', 'Савва')
}

function canLearnPrayer(page: Page): Promise<boolean> {
    return page.evaluate(
        (actorId) =>
            window
                .__ratataTest!.observe()
                .targets.some(
                    (target) =>
                        target.id === actorId &&
                        target.actions.some(
                            ({ command }) =>
                                command.type === 'learn_ability' &&
                                command.abilityId === 'pray_grave'
                        )
                ),
        savvaId
    )
}

async function waitForLesson(page: Page): Promise<void> {
    await expect.poll(() => canLearnPrayer(page), { timeout: 15_000 }).toBe(true)
}
