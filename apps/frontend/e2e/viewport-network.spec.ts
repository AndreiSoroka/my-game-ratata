import type { ClientMessage, WorldSnapshot } from '@my-game-ratata/contracts'
import { expect, test } from '@playwright/test'

type ViewportMessage = Extract<ClientMessage, { type: 'set_viewport' }>

for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
]) {
    test(`sends the camera viewport and receives only nearby world objects (${String(viewport.width)}px)`, async ({
        page,
    }) => {
        test.setTimeout(60_000)
        await page.setViewportSize(viewport)
        const views: ViewportMessage[] = []
        let initial: WorldSnapshot | undefined
        page.on('websocket', (socket) => {
            if (!socket.url().endsWith('/ws')) return
            socket.on('framesent', ({ payload }) => {
                const message = JSON.parse(String(payload)) as ClientMessage
                if (message.type === 'set_viewport') views.push(message)
            })
            socket.on('framereceived', ({ payload }) => {
                const message = JSON.parse(String(payload)) as {
                    type: string
                    snapshot?: WorldSnapshot
                }
                if (message.type === 'world_init') initial = message.snapshot
            })
        })
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate(
            (name) => window.__ratataTest!.join(name, 'vanguard'),
            `viewport-${String(viewport.width)}`
        )
        await expect.poll(() => views.length).toBeGreaterThan(0)
        expect(views.at(-1)?.locationId).toBe(initial?.location?.id)
        const automatic = views.at(-1)!.bounds
        expect(await page.evaluate(() => window.__ratataGameDebug?.setCameraZoom?.(1))).toBe(true)
        await expect
            .poll(() => {
                const bounds = views.at(-1)!.bounds
                return bounds.right - bounds.left
            })
            .toBeGreaterThan((automatic.right - automatic.left) * 1.5)
        const before = views.at(-1)!
        expect(before.bounds.right).toBeGreaterThan(before.bounds.left)
        expect(before.bounds.bottom).toBeGreaterThan(before.bounds.top)

        expect(await page.evaluate(() => window.__ratataGameDebug?.setCameraZoom?.(4))).toBe(true)
        await expect
            .poll(() => {
                const current = views.at(-1)!.bounds
                return current.right - current.left
            })
            .toBeLessThan((before.bounds.right - before.bounds.left) / 2)

        await expect
            .poll(() =>
                page.evaluate(() => window.__ratataTest!.getState().snapshot?.characters.length)
            )
            .toBeLessThan(initial!.characters.length)
        const state = await page.evaluate(() => {
            const state = window.__ratataTest!.getState()
            return {
                id: state.localPlayerId,
                self: state.snapshot?.characters.find((actor) => actor.id === state.localPlayerId),
                adventure: state.snapshot?.adventure,
                connected: state.connected,
                characterCount: state.snapshot?.characters.length,
                bytes: new TextEncoder().encode(JSON.stringify(state.snapshot)).length,
            }
        })
        expect(state.connected).toBe(true)
        expect(state.self?.id).toBe(state.id)
        expect(state.self?.inventory).toEqual(
            initial!.characters.find((actor) => actor.id === state.id)?.inventory
        )
        expect(state.adventure?.quest.id).toBe(initial!.adventure?.quest.id)
        const initialBytes = new TextEncoder().encode(JSON.stringify(initial)).length
        expect(state.bytes).toBeLessThan(initialBytes)
        await test.info().attach('viewport-network.json', {
            body: JSON.stringify({
                viewport,
                initialBytes,
                filteredBytes: state.bytes,
                initialCharacters: initial!.characters.length,
                filteredCharacters: state.characterCount,
            }),
            contentType: 'application/json',
        })

        const zoomed = views.at(-1)!
        await page.setViewportSize({ width: viewport.width + 180, height: viewport.height })
        await expect
            .poll(() => {
                const bounds = views.at(-1)!.bounds
                return bounds.right - bounds.left
            })
            .toBeGreaterThan(zoomed.bounds.right - zoomed.bounds.left)

        expect(await page.evaluate(() => window.__ratataGameDebug?.setCameraZoom?.(1))).toBe(true)
        await expect
            .poll(() => {
                const bounds = views.at(-1)!.bounds
                return bounds.right - bounds.left
            })
            .toBeGreaterThan(zoomed.bounds.right - zoomed.bounds.left + 100)
        await page.evaluate(() => window.__ratataTest!.stop())
    })
}
