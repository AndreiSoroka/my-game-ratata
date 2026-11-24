import type { DoorState, GameEventPayload, ServerMessage, Vector2 } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

import { RuntimeSnapshotStream } from '../src/game/runtime/runtimeSnapshotStream'
import { joinSocial } from './social-helpers'
import { selectedWorldTarget } from './world-target-ui'

const library = 'map-2-2:door:novogorod.library'

test('opens a shared city door from either side and blocks motion while closed', async ({
    page,
    browser,
}, info) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const peers = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    try {
        const observer = await peers.newPage()
        const observedStates = recordDoorStates(observer, library)
        await joinSocial(observer, 'door-observer')
        await joinSocial(page, 'door-traveler')
        const door = await page.waitForFunction(() =>
            window
                .__ratataTest!.getState()
                .snapshot?.adventure?.worldObjects?.find(
                    (object) => object.id === 'map-2-2:door:novogorod.library'
                )
        )
        const { position, bounds } = (await door.jsonValue())!
        const outside = { x: position.x, y: bounds.y + bounds.height + 10 }
        const inside = { x: position.x, y: bounds.y - 10 }
        await walk(page, outside)
        await selectDoor(page, library)
        await expectDoor(page, library, 'open')

        await closeDoor(page, library, async () => {
            await page.getByRole('button', { name: /^F .*Закрыть дверь/u }).click()
            const action = page.getByRole('menu').getByRole('menuitem', { name: /^Закрыть дверь/u })
            await expect(action).toBeVisible()
            await action.click()
        })
        await expect.poll(() => observedStates).toContain('closed')
        const closedFrame = await captureDoorFrame(page, position)
        await info.attach('closed-door.png', { body: closedFrame, contentType: 'image/png' })

        await page.evaluate(() => window.__ratataTest!.moveFor({ x: 0, y: -1 }, 600))
        expect(
            await page.evaluate(() => window.__ratataTest!.getState().player!.position.y)
        ).toBeGreaterThanOrEqual(bounds.y + bounds.height)
        await walk(page, outside)
        await selectDoor(page, library)
        await page.keyboard.press('KeyF')
        await expectDoor(page, library, 'open')
        await expect
            .poll(() => observedStates.slice(observedStates.indexOf('closed') + 1))
            .toContain('open')
        const openFrame = await captureDoorFrame(page, position)
        await info.attach('open-door.png', { body: openFrame, contentType: 'image/png' })
        expect(openFrame.equals(closedFrame)).toBe(false)

        await walk(page, inside)
        await selectDoor(page, library)
        await closeDoor(page, library, () => page.keyboard.press('KeyF'))
        await expect(async () => {
            if ((await doorState(page, library)) === 'open') return
            await page.keyboard.press('KeyF')
            await expectDoor(page, library, 'open')
        }).toPass({ timeout: 10_000 })
        await walk(page, outside)
    } finally {
        await peers.close()
    }
})

test('knocks on an authored locked door in the outskirts without opening it', async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width: 1280, height: 800 })
    const events: GameEventPayload[] = []
    page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname !== '/ws') return
        socket.on('framereceived', ({ payload }) => {
            if (typeof payload !== 'string') return
            const message = JSON.parse(payload) as ServerMessage
            if (message.type === 'event') events.push(message.event)
        })
    })
    await joinSocial(page, 'door-knocker')
    const travel = await page.evaluate(() =>
        window.__ratataTest!.travel('north', { timeoutMs: 35_000 })
    )
    expect(travel).toMatchObject({ status: 'arrived', locationId: 'map-2-1' })
    const door = await page.evaluate(() =>
        window
            .__ratataTest!.getState()
            .snapshot!.adventure!.worldObjects!.find((object) => object.door?.state === 'locked')
    )
    expect(door).toBeDefined()
    const { id, position, bounds } = door!
    await walk(page, { x: position.x, y: bounds.y + bounds.height + 10 })
    await selectDoor(page, id)
    await expect(page.getByRole('button', { name: /^F .*Постучать в дверь/u })).toBeVisible()
    await page.keyboard.press('KeyF')
    await expect
        .poll(() => events.find((event) => event.objectId === id && event.kind === 'door_interact'))
        .toMatchObject({ audioCue: { effect: 'doorKnock', position } })
    await expectDoor(page, id, 'locked')
})

async function walk(page: Page, target: Vector2): Promise<void> {
    const reached = await page.evaluate(
        (destination) =>
            window.__ratataTest!.navigate(destination, { tolerance: 1, timeoutMs: 30_000 }),
        target
    )
    expect(reached.status, `${JSON.stringify(target)}: ${reached.reason}`).toBe('arrived')
}

async function selectDoor(page: Page, id: string): Promise<void> {
    await page.bringToFront()
    await page.locator('canvas[data-game-canvas=true]').focus()
    const selected = selectedWorldTarget(page)
    const key = `world:${id}`
    const limit = await page.evaluate(() => window.__ratataTest!.observe().targets.length + 1)
    for (let index = 0; index < limit; index++) {
        if (
            (await selected.count()) &&
            (await selected.getAttribute('data-selected-target-key')) === key
        )
            break
        await page.keyboard.press('Tab')
    }
    await expect(selected).toHaveAttribute('data-selected-target-key', key)
}

async function closeDoor(page: Page, id: string, close: () => Promise<void>): Promise<void> {
    await expect(async () => {
        if ((await doorState(page, id)) === 'closed') return
        await close()
        await expect.poll(() => doorState(page, id), { timeout: 1000 }).toBe('closed')
    }).toPass({ timeout: 15_000, intervals: [500, 1000] })
}

function doorState(page: Page, id: string): Promise<DoorState | undefined> {
    return page.evaluate(
        (objectId) =>
            window
                .__ratataTest!.getState()
                .snapshot?.adventure?.worldObjects?.find((object) => object.id === objectId)?.door
                ?.state,
        id
    )
}

async function expectDoor(page: Page, id: string, state: DoorState): Promise<void> {
    await expect.poll(() => doorState(page, id)).toBe(state)
}

function recordDoorStates(page: Page, id: string): DoorState[] {
    const stream = new RuntimeSnapshotStream()
    const states: DoorState[] = []
    page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname !== '/ws') return
        socket.on('framereceived', ({ payload }) => {
            if (typeof payload !== 'string') return
            const message = JSON.parse(payload) as ServerMessage
            if (
                message.type !== 'world_init' &&
                message.type !== 'snapshot' &&
                message.type !== 'snapshot_delta'
            )
                return
            const receipt =
                message.type === 'world_init' ? stream.initialize(message) : stream.receive(message)
            if (receipt.kind !== 'applied') return
            const state = receipt.snapshot.adventure?.worldObjects?.find(
                (object) => object.id === id
            )?.door?.state
            if (state !== undefined && state !== states.at(-1)) states.push(state)
        })
    })
    return states
}

async function captureDoorFrame(page: Page, position: Vector2): Promise<Buffer> {
    const center = await page.evaluate(
        (point) => window.__ratataGameDebug?.worldToPage(point),
        position
    )
    expect(center).toBeDefined()
    return page.screenshot({
        clip: { x: center!.x - 12, y: center!.y - 12, width: 24, height: 24 },
    })
}
