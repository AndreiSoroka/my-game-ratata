import type {
    CharacterSnapshot,
    ServerMessage,
    Vector2,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { expect, type Page } from '@playwright/test'

import { RuntimeSnapshotStream } from '../src/game/runtime/runtimeSnapshotStream'
import { joinSocial } from './social-helpers'

interface PositionSample {
    connected: boolean | undefined
    position: Vector2
    serverTime: number
}

export async function expectEchoReconnect(page: Page): Promise<void> {
    const hero = await page.evaluate(() => window.__ratataTest!.getState().player!)
    const returned = captureReturningHero(page, hero.id)
    const observer = await page.context().newPage()
    try {
        const samples = capturePositionSamples(observer, hero.id)
        await joinSocial(observer, 'echo-light-witness')
        const arrival = await observer.evaluate(
            (position) =>
                window.__ratataTest!.navigate(position, { tolerance: 32, timeoutMs: 25_000 }),
            hero.position
        )
        expect(arrival.status, arrival.reason).toBe('arrived')
        await expect.poll(() => samples.at(-1)?.connected).toBe(true)
        await page.bringToFront()
        const leave = await page.evaluate(() => window.__ratataTest!.getState())
        expect(leave.player!.inventory.length).toBeGreaterThan(0)
        expect(leave.player!.equipment.light?.itemId).toBe('lantern')

        await leaveThroughMenu(page)
        await expect
            .poll(() =>
                samples.some(
                    (entry) =>
                        entry.connected === false &&
                        distance(entry.position, leave.player!.position) > 4
                )
            )
            .toBe(true)
        await page.getByRole('textbox', { name: 'Имя героя', exact: true }).fill(hero.nickname)
        await page.getByRole('button', { name: 'Войти', exact: true }).click()
        await expect.poll(returned).toBeDefined()
        await expect(page.locator('canvas[data-game-canvas=true]')).toBeVisible()

        const joined = returned()!
        const player = joined.characters.find(({ id }) => id === hero.id)!
        expect(player.connected).toBe(true)
        expect(player.heroClass).toBe(leave.player!.heroClass)
        expect(player.inventory).toEqual(leave.player!.inventory)
        expect(player.equipment).toEqual(leave.player!.equipment)
        expect(joined.location?.id).toBe(leave.location?.id)
        await expectPositionAtJoin(
            samples,
            player,
            joined,
            leave.player!,
            leave.location!.map.tileWidth
        )
        await expect
            .poll(() => page.evaluate(() => window.__ratataTest!.getState().localPlayerId))
            .toBe(hero.id)
    } finally {
        await observer.close()
        await page.bringToFront()
    }
}

async function leaveThroughMenu(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Игровое меню', exact: true }).click()
    await page
        .getByRole('dialog', { name: 'Игровое меню', exact: true })
        .getByRole('button', { name: 'Выйти из игры', exact: true })
        .click()
    await expect(page.getByRole('textbox', { name: 'Имя героя', exact: true })).toBeVisible()
}

async function expectPositionAtJoin(
    samples: PositionSample[],
    player: CharacterSnapshot,
    joined: WorldSnapshot,
    left: CharacterSnapshot,
    tileWidth: number
): Promise<void> {
    await expect
        .poll(
            () =>
                samples.find((entry) => entry.connected && entry.serverTime >= joined.serverTime)
                    ?.position
        )
        .toEqual(player.position)
    const lastEcho = samples.findLast(
        (entry) => entry.connected === false && entry.serverTime <= joined.serverTime
    )
    expect(lastEcho, 'The witness saw the Echo before the new connection').toBeDefined()
    expect(distance(player.position, lastEcho!.position)).toBeLessThanOrEqual(tileWidth)
    expect(distance(player.position, left.position)).toBeLessThanOrEqual(3 * tileWidth)
}

function captureReturningHero(page: Page, id: string): () => WorldSnapshot | undefined {
    let snapshot: WorldSnapshot | undefined
    observeGameFrames(page, (frame) => {
        if (frame.type === 'world_init' && frame.playerId === id) snapshot ??= frame.snapshot
    })
    return () => snapshot
}

function capturePositionSamples(page: Page, id: string): PositionSample[] {
    const samples: PositionSample[] = []
    const stream = new RuntimeSnapshotStream()
    observeGameFrames(page, (frame) => {
        const result =
            frame.type === 'world_init'
                ? stream.initialize(frame)
                : frame.type === 'snapshot' || frame.type === 'snapshot_delta'
                  ? stream.receive(frame)
                  : undefined
        if (result?.kind !== 'applied') return
        const { characters, serverTime } = result.snapshot
        const actor = characters.find((character) => character.id === id)
        if (actor)
            samples.push({ connected: actor.connected, position: actor.position, serverTime })
    })
    return samples
}

function observeGameFrames(page: Page, onFrame: (frame: ServerMessage) => void): void {
    page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname !== '/ws') return
        socket.on('framereceived', ({ payload }) => {
            if (typeof payload === 'string') onFrame(JSON.parse(payload) as ServerMessage)
        })
    })
}

function distance(first: Vector2, second: Vector2): number {
    return Math.hypot(first.x - second.x, first.y - second.y)
}
