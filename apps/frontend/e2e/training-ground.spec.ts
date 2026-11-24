import {
    ABILITY_DEFINITIONS,
    type ArrowAbilityId,
    CENTER_LOCATION_ID,
    type GameEventPayload,
    type HeroClass,
    isArrowAbility,
    readTrainingMapData,
    type ServerMessage,
    type Vector2,
} from '@my-game-ratata/contracts'
import { expect, type Locator, type Page, test } from '@playwright/test'

import { RuntimeSnapshotStream } from '../src/game/runtime/runtimeSnapshotStream'
import { selectedWorldTarget } from './world-target-ui'

const areaId = 'map-2-2:training:yard-1'
const dummyId = 'map-2-2:training:dummy-1'

test('shows the learned prayer radius in the authored training interior without a target', async ({
    page,
}, info) => {
    test.setTimeout(60_000)
    const yard = await join(page, `prayer-yard-${info.project.name}`, 'cleric')
    const canvas = page.locator('canvas[data-game-canvas=true]')
    await expect(canvas).not.toHaveAttribute('data-training-prayer-radius')
    await navigate(page, yard.inside)
    const prayer = await page.evaluate(
        () => window.__ratataTest!.getState().player!.abilities!.prayer!
    )
    expect(prayer.harm).toBe(false)
    await expect(selectedWorldTarget(page)).toHaveCount(0)
    await expect(canvas).toHaveAttribute('data-training-prayer-radius', String(prayer.radius))
    await page.screenshot({ path: info.outputPath('training-prayer-radius.png') })
    await navigate(page, yard.outside)
    await expect(canvas).not.toHaveAttribute('data-training-prayer-radius')
})

for (const mobile of [false, true]) {
    test(`selects the dummy and approaches for single and repeated blade attacks (${mobile ? 'mobile' : 'desktop'})`, async ({
        page,
    }, info) => {
        test.setTimeout(60_000)
        const starts: GameEventPayload[] = []
        page.on('websocket', (socket) => {
            if (new URL(socket.url()).pathname !== '/ws') return
            socket.on('framereceived', ({ payload }) => {
                if (typeof payload !== 'string') return
                const message = JSON.parse(payload) as ServerMessage
                if (message.type === 'event' && message.event.kind === 'attack') {
                    starts.push(message.event)
                }
            })
        })
        await page.setViewportSize(
            mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
        )
        const yard = await join(page, `blade-${info.project.name}-${mobile}`, 'vanguard')
        const playerId = await page.evaluate(() => window.__ratataTest!.getState().localPlayerId)
        const localAttacks = () => starts.filter((event) => event.actorId === playerId)
        const selected = selectedWorldTarget(page)
        const attack = page.getByRole('button', { name: /^1: Удар ножом/ })
        const playerX = () =>
            page.evaluate(() => window.__ratataTest!.getState().player!.position.x)

        await navigate(page, yard.inside)
        await expect(selected).toHaveCount(0)
        await activateBlade(page, attack, mobile, 1)
        await expect(selected).toHaveAttribute('data-selected-target-key', `character:${dummyId}`)
        await expect.poll(playerX).toBeGreaterThan(yard.inside.x + 8)
        await expect.poll(() => localAttacks().length).toBe(1)
        await waitForAttackIdle(page)
        expect(localAttacks().map((event) => event.targetId)).toEqual([dummyId])

        await page.keyboard.press('Escape')
        await expect(selected).toHaveCount(0)
        await navigate(page, yard.inside)
        await activateBlade(page, attack, mobile, 2)
        await expect(selected).toHaveAttribute('data-selected-target-key', `character:${dummyId}`)
        await expect(attack).toHaveAttribute('aria-pressed', 'true')
        await expect(attack.getByLabel('Автоповтор')).toBeVisible()
        await expect.poll(playerX).toBeGreaterThan(yard.inside.x + 8)
        await expect.poll(() => localAttacks().length).toBeGreaterThanOrEqual(3)
        await expect(page.getByText('Повтор: действие выполняется', { exact: true })).toHaveCount(0)

        await attack.click()
        await expect(attack).toHaveAttribute('aria-pressed', 'false')
        await page.waitForFunction(
            () => window.__ratataTest!.getState().player?.control?.mode === 'none'
        )
        const countAfterCancel = localAttacks().length
        await waitForAttackIdle(page)
        expect(localAttacks().map((event) => event.targetId)).toEqual(
            Array.from({ length: countAfterCancel }, () => dummyId)
        )
    })

    test(`trains with ordinary attacks and clears guides outside the pen (${mobile ? 'mobile' : 'desktop'})`, async ({
        page,
    }, info) => {
        test.setTimeout(150_000)
        const hits: GameEventPayload[] = []
        const arrowPhases: GameEventPayload[] = []
        let socketUrl = ''
        page.on('websocket', (socket) => {
            if (new URL(socket.url()).pathname !== '/ws' || socketUrl) return
            socketUrl = socket.url()
            socket.on('framereceived', (frame) => {
                if (typeof frame.payload !== 'string') return
                const message = JSON.parse(frame.payload) as {
                    type: string
                    event?: GameEventPayload
                }
                if (
                    message.type === 'event' &&
                    message.event?.kind === 'damage' &&
                    message.event.targetId === dummyId
                )
                    hits.push(message.event)
                if (
                    message.type === 'event' &&
                    message.event?.kind === 'attack' &&
                    isArrowAbility(message.event.abilityId)
                )
                    arrowPhases.push(message.event)
            })
        })
        await page.setViewportSize(
            mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
        )
        const name = `yard-${info.project.name}-${mobile}`
        const yard = await join(page, name)
        const playerId = await page.evaluate(() => window.__ratataTest!.getState().localPlayerId)
        const canvas = page.locator('canvas[data-game-canvas=true]')
        await expect(page.getByRole('button', { name: /^2: Быстрый выстрел/ })).toBeVisible()
        await expect(page.getByRole('button', { name: /^3: Снайперский выстрел/ })).toBeVisible()
        await expect(canvas).not.toHaveAttribute('data-training-guides')
        await navigate(page, yard.inside)
        await expect(canvas).toHaveAttribute('data-training-guides', areaId)
        await canvas.focus()
        await selectTrainingTarget(page)
        await expect(selectedWorldTarget(page)).toHaveAttribute(
            'data-selected-target-key',
            `character:${dummyId}`
        )
        const before = await dummyState(page)
        await page.keyboard.press('Digit2')
        const quickHit = await expectArrowHit(playerId, 'shot', arrowPhases, hits)
        expect(quickHit?.hitQuality).toMatch(/weak|normal|strong|critical/)
        expect(await dummyState(page)).toEqual(before)
        await waitForAttackIdle(page)
        await page.getByRole('button', { name: /^3: Снайперский выстрел/ }).click()
        await expectArrowHit(playerId, 'sniper_shot', arrowPhases, hits)
        await waitForAttackIdle(page)
        expect(await dummyState(page)).toEqual(before)
        await page.screenshot({ path: info.outputPath('training-inside.png') })
        await page.screenshot({ path: `/tmp/ratata-training-${mobile ? 'mobile' : 'desktop'}.png` })

        await navigate(page, yard.outside)
        await expect(canvas).not.toHaveAttribute('data-training-guides')
        // Keep the target inside the observer's camera interest area on narrow screens.
        expect(await page.evaluate(() => window.__ratataGameDebug?.setCameraZoom?.(1))).toBe(true)
        await expect
            .poll(() =>
                page.evaluate(
                    (id) =>
                        window
                            .__ratataTest!.getState()
                            .snapshot!.characters.some((actor) => actor.id === id),
                    dummyId
                )
            )
            .toBe(true)
        const outsideHit = hits.length
        // A second ranger connects and walks through the same validated socket
        // commands. Its shot is observed from outside without opening another
        // WebGL page or changing either character's authoritative state.
        const guest = await shootAsGuest(socketUrl, `${name}-g`, yard.inside)
        expect(guest.amount).toBeGreaterThan(0)
        await expect
            .poll(() => hits.slice(outsideHit).some((hit) => hit.actorId === guest.actorId))
            .toBe(true)
        const observedGuest = hits.slice(outsideHit).find((hit) => hit.actorId === guest.actorId)
        expect(observedGuest).not.toHaveProperty('amount')
        expect(await dummyState(page)).toEqual(before)
        expect(await page.evaluate(() => window.__ratataTest!.getState().player!.position)).toEqual(
            yard.outside
        )
        await expect(canvas).not.toHaveAttribute('data-training-guides')
        await page.screenshot({ path: info.outputPath('training-outside.png') })

        // Starting outside is allowed: ordinary auto-shot approaches through
        // the opening until shared range/LOS rules permit a hit.
        const resumedHit = hits.length
        await page.evaluate(
            (targetId) =>
                window.__ratataTest!.send({
                    type: 'auto_action',
                    action: { kind: 'ability', abilityId: 'shot', targetId },
                }),
            dummyId
        )
        await expect.poll(() => hits.length).toBeGreaterThan(resumedHit)
        expect(hits[resumedHit]?.amount).toBeGreaterThan(0)
        await expect(canvas).toHaveAttribute('data-training-guides', areaId)
        await page.evaluate(() => window.__ratataTest!.send({ type: 'cancel_control' }))
        const identity = await page.evaluate(() => window.__ratataTest!.getState().localPlayerId)
        await page.reload()
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await expect(page.locator('canvas[data-training-guides]')).toHaveCount(0)
        await page.evaluate((name) => window.__ratataTest!.join(name, 'ranger'), name)
        expect(await page.evaluate(() => window.__ratataTest!.getState().localPlayerId)).toBe(
            identity
        )
        await expect(canvas).toHaveAttribute('data-training-guides', areaId)

        const departure = await page.evaluate(() =>
            window.__ratataTest!.travel('east', { timeoutMs: 30_000 })
        )
        expect(departure, JSON.stringify(departure)).toMatchObject({
            status: 'arrived',
            locationId: 'map-3-2',
        })
        await expect(canvas).not.toHaveAttribute('data-training-guides')
        expect(await page.evaluate(() => window.__ratataTest!.getState().player!.alive)).toBe(true)
    })
}

async function expectArrowHit(
    playerId: string | undefined,
    abilityId: ArrowAbilityId,
    phases: GameEventPayload[],
    hits: GameEventPayload[]
): Promise<GameEventPayload | undefined> {
    const localPhases = () =>
        phases.filter((event) => event.actorId === playerId && event.abilityId === abilityId)
    await expect
        .poll(() => localPhases().map((event) => event.phase))
        .toEqual(['started', 'completed'])
    const [started, completed] = localPhases()
    expect(started).toMatchObject({
        targetId: dummyId,
        actionId: expect.any(String),
        durationMs: ABILITY_DEFINITIONS[abilityId].windupMs,
    })
    expect(completed).toMatchObject({ actionId: started!.actionId })
    expect(completed?.projectile).toBeDefined()
    const hit = () => hits.find((event) => event.actionId === started?.actionId)
    await expect.poll(() => hit()?.amount).toBeGreaterThan(0)
    return hit()
}

async function activateBlade(
    page: Page,
    attack: Locator,
    pointer: boolean,
    count: 1 | 2
): Promise<void> {
    if (pointer) {
        await attack.click({ clickCount: count })
        return
    }
    await page.locator('canvas[data-game-canvas=true]').focus()
    for (let press = 0; press < count; press += 1) {
        await page.keyboard.press('Digit1')
    }
}

async function waitForAttackIdle(page: Page): Promise<void> {
    await page.waitForFunction(() => {
        const player = window.__ratataTest!.getState().player
        return player?.control?.mode === 'none' && player.cooldowns.attackMsLeft === 0
    })
}

async function join(page: Page, name: string, heroClass: HeroClass = 'ranger') {
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.addStyleTag({ content: '.test-panel { display: none !important }' })
    const cityMap = page.waitForResponse((response) => {
        const path = new URL(response.url()).pathname
        return path.startsWith('/world/maps/') && path.endsWith(`/${CENTER_LOCATION_ID}.json`)
    })
    await page.evaluate(({ name, heroClass }) => window.__ratataTest!.join(name, heroClass), {
        name,
        heroClass,
    })
    await expect(page.locator('canvas[data-game-canvas=true]')).toBeVisible()
    const map = (await (await cityMap).json()) as Parameters<typeof readTrainingMapData>[0]
    const training = readTrainingMapData(map, CENTER_LOCATION_ID)
    const area = training.areas.find((candidate) => candidate.id === areaId)!
    const dummy = training.targets.find((candidate) => candidate.id === dummyId)!
    // The generated yard keeps its authored west entrance aligned with the
    // dummy; stay inside Shot range and just outside its interior respectively.
    return {
        inside: { x: dummy.position.x - map.tilewidth * 3.5, y: dummy.position.y },
        outside: { x: area.bounds.x - map.tilewidth / 2, y: dummy.position.y },
    }
}

async function selectTrainingTarget(page: Page): Promise<void> {
    const selected = selectedWorldTarget(page)
    const targetCount = await page.evaluate(() => window.__ratataTest!.observe().targets.length)
    for (let count = 0; count <= targetCount; count += 1) {
        await page.keyboard.press('Tab')
        if ((await selected.getAttribute('data-selected-target-key')) === `character:${dummyId}`)
            return
    }
}

async function navigate(page: Page, position: { x: number; y: number }): Promise<void> {
    const outcome = await page.evaluate(
        (position) => window.__ratataTest!.navigate(position, { timeoutMs: 25_000, tolerance: 1 }),
        position
    )
    expect(outcome.status, JSON.stringify(outcome)).toBe('arrived')
}

async function dummyState(page: Page) {
    return page.evaluate((id) => {
        const target = window
            .__ratataTest!.getState()
            .snapshot!.characters.find((actor) => actor.id === id)!
        return { position: target.position, alive: target.alive, health: target.health }
    }, dummyId)
}

async function shootAsGuest(url: string, name: string, inside: Vector2) {
    const snapshots = new RuntimeSnapshotStream()
    return new Promise<{
        amount: number | undefined
        actorId: string
    }>((resolve, reject) => {
        const socket = new WebSocket(url)
        let actorId: string | undefined
        let fired = false
        const timeout = setTimeout(() => {
            socket.close()
            reject(new Error('Guest ranger did not reach and hit the dummy'))
        }, 20_000)
        socket.addEventListener('open', () =>
            socket.send(
                JSON.stringify({
                    type: 'join',
                    nickname: name,
                    heroClass: 'ranger',
                })
            )
        )
        socket.addEventListener('message', ({ data }) => {
            const message = JSON.parse(String(data)) as ServerMessage
            if (message.type === 'world_init') {
                actorId = message.playerId
                socket.send(JSON.stringify({ type: 'move_to', target: inside }))
            }
            const receipt =
                message.type === 'world_init'
                    ? snapshots.initialize(message)
                    : message.type === 'snapshot' || message.type === 'snapshot_delta'
                      ? snapshots.receive(message)
                      : undefined
            if (receipt?.kind === 'applied') {
                const actor = receipt.snapshot.characters.find(
                    (candidate) => candidate.id === actorId
                )
                if (
                    !fired &&
                    actor &&
                    Math.hypot(actor.position.x - inside.x, actor.position.y - inside.y) < 1
                ) {
                    fired = true
                    socket.send(
                        JSON.stringify({
                            type: 'use_ability',
                            abilityId: 'shot',
                            targetId: dummyId,
                        })
                    )
                }
            }
            if (
                message.type === 'event' &&
                message.event.kind === 'damage' &&
                message.event.targetId === dummyId &&
                message.event.actorId === actorId &&
                actorId
            ) {
                clearTimeout(timeout)
                resolve({ amount: message.event.amount, actorId })
                socket.close()
            }
        })
    })
}
