import type { ClientMessage, ServerMessage, SnapshotPatch } from '@my-game-ratata/contracts'
import { expect, test } from '@playwright/test'

import { RuntimeSnapshotStream } from '../src/game/runtime/runtimeSnapshotStream'

for (const width of [390, 1280]) {
    test(`sends changed fields and recovers a missing delta (${String(width)}px)`, async ({
        page,
    }) => {
        test.setTimeout(60_000)
        const stream = new RuntimeSnapshotStream(true)
        const frames: ServerMessage[] = []
        const commands: ClientMessage[] = []
        let playerId: string | undefined
        let dropped = false
        let dropNext = false
        await page.routeWebSocket(/\/ws$/, (client) => {
            const server = client.connectToServer()
            client.onMessage((data) => {
                commands.push(JSON.parse(data.toString()) as ClientMessage)
                server.send(data)
            })
            server.onMessage((data) => {
                const message = JSON.parse(data.toString()) as ServerMessage
                frames.push(message)
                if (message.type === 'world_init') {
                    playerId = message.playerId
                    stream.initialize(message)
                } else if (message.type === 'snapshot' || message.type === 'snapshot_delta') {
                    const receipt = stream.receive(message)
                    if (receipt.kind !== 'applied') throw new Error('Invalid server stream')
                }
                if (dropNext && message.type === 'snapshot_delta') {
                    dropNext = false
                    dropped = true
                } else client.send(data)
            })
        })
        await page.setViewportSize({ width, height: 844 })
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate((name) => window.__ratataTest!.join(name, 'arcanist'), `delta-${width}`)
        await expect.poll(() => frames.filter(isDelta).length).toBeGreaterThan(4)
        const start = frames.length
        await page.evaluate(() =>
            window.__ratataTest!.send({ type: 'use_ability', abilityId: 'barrier' })
        )
        await expect
            .poll(() => changedPlayerFields(frames.slice(start), playerId!))
            .toContain('abilities')
        await expect
            .poll(() =>
                page.evaluate(
                    () => window.__ratataTest!.getState().player?.abilities?.cooldowns.barrier ?? 0
                )
            )
            .toBeGreaterThan(0)
        const timerFrames = () =>
            frames
                .slice(start)
                .filter(isDelta)
                .filter(
                    (message) =>
                        playerPatch(message.patch, playerId!)?.patch?.abilities !== undefined
                )
        await expect.poll(() => timerFrames().length).toBeGreaterThan(4)
        for (const frame of timerFrames()) {
            const patch = playerPatch(frame.patch, playerId!)!
            expect(patch.set?.position).toBeUndefined()
            expect(patch.patch?.position).toBeUndefined()
        }
        const before = await page.evaluate(() => window.__ratataTest!.getState().snapshot!.tick)
        const recoveryStart = frames.length
        dropNext = true
        await expect.poll(() => dropped).toBe(true)
        await expect
            .poll(() => commands.filter((message) => message.type === 'snapshot_resync').length)
            .toBe(1)
        await expect
            .poll(() => frames.slice(recoveryStart).some((message) => message.type === 'snapshot'))
            .toBe(true)
        await expect
            .poll(() => page.evaluate(() => window.__ratataTest!.getState().snapshot!.tick))
            .toBeGreaterThan(before + 3)
        const state = await page.evaluate(() => window.__ratataTest!.getState())
        expect(state.connected).toBe(true)
        expect(state.error).toBe('')
        expect(state.player?.id).toBe(playerId)
        await test.info().attach('delta-recovery.json', {
            body: JSON.stringify({
                width,
                frames: frames.length,
                deltas: frames.filter(isDelta).length,
                resyncs: 1,
            }),
            contentType: 'application/json',
        })
        await page.evaluate(() => window.__ratataTest!.stop())
    })
}

function isDelta(
    message: ServerMessage
): message is Extract<ServerMessage, { type: 'snapshot_delta' }> {
    return message.type === 'snapshot_delta'
}

function playerPatch(patch: SnapshotPatch | undefined, id: string): SnapshotPatch | undefined {
    return patch?.collections?.characters?.changed?.find((entry) => entry.id === id)?.patch
}

function changedPlayerFields(frames: ServerMessage[], id: string): string[] {
    return frames.filter(isDelta).flatMap((frame) => {
        const patch = playerPatch(frame.patch, id)
        return Object.keys(patch?.patch ?? {}).concat(Object.keys(patch?.set ?? {}))
    })
}
