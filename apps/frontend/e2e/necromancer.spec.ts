import {
    type GameEventPayload,
    type MovementMode,
    type ServerMessage,
    type Vector2,
    WESTERN_RUINS_LOCATION_ID,
} from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

import { selectedWorldTarget } from './world-target-ui'

interface RuinsMap {
    layers: { name: string; objects?: (Vector2 & { type: string })[] }[]
}

const savvaId = 'npc_necromancer_1'

test('learns the Ash prayer from Savva before facing his Withering Bolt', async ({
    page,
}, info) => {
    test.setTimeout(240_000)
    const bolts = watchSavvaBolts(page)
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.addStyleTag({ content: '.test-panel { display: none !important }' })
    await page
        .getByRole('textbox', { name: 'Имя героя' })
        .fill(`ash-${info.workerIndex}-${Date.now().toString(36)}`)
    await page.getByRole('radio', { name: 'Авангард', exact: true }).check()
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    await page.waitForFunction(
        () => {
            const state = window.__ratataTest?.getState()
            return state?.mapReady === true && state.player?.alive === true
        },
        undefined,
        { timeout: 15_000 }
    )

    const [ruinsMap] = await Promise.all([
        page.waitForResponse(
            (response) => {
                const path = new URL(response.url()).pathname
                return (
                    path.startsWith('/world/maps/') &&
                    path.endsWith(`/${WESTERN_RUINS_LOCATION_ID}.json`)
                )
            },
            { timeout: 120_000 }
        ),
        travelToRuins(page),
    ])
    const map: RuinsMap = await ruinsMap.json()
    const refuge = map.layers
        .find(({ name }) => name === 'Ash refuge')
        ?.objects?.find(({ type }) => type === 'ash_home')
    expect(refuge).toBeDefined()
    await approachTeacher(page, refuge!)
    await learnAshPrayer(page)
    await faceWitheringBolt(page, refuge!, bolts)
})

function watchSavvaBolts(page: Page): GameEventPayload[] {
    const events: GameEventPayload[] = []
    page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname !== '/ws') return
        socket.on('framereceived', ({ payload }) => {
            const message = JSON.parse(payload.toString()) as ServerMessage
            if (
                message.type === 'event' &&
                message.event.actorId === savvaId &&
                message.event.abilityId === 'ash_exhaustion'
            ) {
                events.push(message.event)
            }
        })
    })
    return events
}

async function travelToRuins(page: Page): Promise<void> {
    for (let crossing = 0; crossing < 2; crossing += 1) {
        // Stay concealed from roaming creatures before entering the ruins.
        if (crossing === 1) await changeMovement(page, 'sneaking')
        const result = await page.evaluate(async () => {
            const game = window.__ratataTest!
            const route = () => game.travel('west', { timeoutMs: 55_000 })
            const first = await route()
            if (first.status !== 'blocked') return first
            // Step aside from a blocked approach using the same movement as the player.
            await game.moveFor({ x: 0, y: -1 }, 450)
            return route()
        })
        expect(result.status, JSON.stringify(result)).toBe('arrived')
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
    await selectSavva(page)
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
}

async function faceWitheringBolt(
    page: Page,
    refuge: Vector2,
    bolts: GameEventPayload[]
): Promise<void> {
    const start = await page.evaluate(() => window.__ratataTest!.getState().player!.position)
    const angle = Math.atan2(start.y - refuge.y, start.x - refuge.x)
    const retreat = onRing(refuge, angle, 66)
    const [cast] = await Promise.all([
        page.waitForFunction(
            (id) => {
                const state = window.__ratataTest!.getState()
                const savva = state.snapshot?.characters.find((actor) => actor.id === id)
                const channel = savva?.abilities?.ashCasting
                return savva?.relationship === 'hostile' &&
                    channel?.abilityId === 'ash_exhaustion' &&
                    channel.targetId === state.localPlayerId
                    ? channel.completesAt - channel.startedAt
                    : undefined
            },
            savvaId,
            { timeout: 30_000 }
        ),
        (async () => {
            await navigateTo(page, refuge, 24)
            await page.evaluate(
                (point) => window.__ratataTest!.navigate(point, { tolerance: 10 }),
                retreat
            )
        })(),
    ])
    expect(await cast.jsonValue()).toBe(2_000)
    await expect
        .poll(() => bolts.map(({ kind, phase }) => ({ kind, phase })), { timeout: 15_000 })
        .toContainEqual({ kind: 'cast', phase: 'completed' })
}

async function approachTeacher(page: Page, home: Vector2): Promise<void> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        if (await canLearnPrayer(page)) return
        const { player, teacher } = await page.evaluate((id) => {
            const state = window.__ratataTest!.getState()
            return {
                player: state.player!.position,
                teacher: state.snapshot?.characters.find((actor) => actor.id === id)?.position,
            }
        }, savvaId)
        const from = Math.atan2(player.y - home.y, player.x - home.x)
        if (teacher === undefined) {
            await navigateTo(page, onRing(home, from + (attempt === 0 ? 0 : Math.PI / 4), 64), 9)
            continue
        }
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
            await navigateTo(page, teacher, 37)
        } else {
            await navigateTo(page, onRing(home, to, Math.max(43, teacherRadius + 12)), 7)
        }
    }
    await waitForLesson(page)
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
    expect(reached.status, JSON.stringify(reached)).toBe('arrived')
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
