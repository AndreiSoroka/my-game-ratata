import { readFileSync } from 'node:fs'

import { CENTER_LOCATION_ID, type ClientMessage, type Vector2 } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

import { type MapVisibility, readMapVisibility } from '../src/game/runtime/mapVisibility'

type MapSource = Parameters<typeof readMapVisibility>[0]
interface Building {
    x: number
    y: number
    width: number
    height: number
    properties?: { name: string; value: unknown }[]
}
const authored = JSON.parse(
    readFileSync(new URL(`../public/game/map/${CENTER_LOCATION_ID}.json`, import.meta.url), 'utf8')
) as Omit<MapSource, 'layers'> & {
    layers: (MapSource['layers'][number] & { objects?: Building[] })[]
}
const grid = readMapVisibility(authored)
const guild = authored.layers
    .find((layer) => layer.name === 'Buildings')!
    .objects!.find((building) =>
        building.properties?.some((p) => p.name === 'kind' && p.value === 'guild')
    )!
const wall = {
    x: guild.x + guild.width - grid.tileWidth / 2,
    y: guild.y + guild.height / 2 + grid.tileHeight / 2,
}
const staging = { x: wall.x + grid.tileWidth * 3.5, y: wall.y }
const first = { x: staging.x, y: staging.y + grid.tileHeight * 9 }
const last = { x: staging.x, y: staging.y + grid.tileHeight * 3 }

for (const mobile of [false, true]) {
    test(`resolves a house click and walks the accepted queue (${mobile ? 'mobile' : 'desktop'})`, async ({
        page,
    }, info) => {
        test.setTimeout(60_000)
        const clicks: Vector2[] = []
        page.on('websocket', (socket) => {
            if (new URL(socket.url()).pathname !== '/ws') return
            socket.on('framesent', (frame) => {
                if (typeof frame.payload !== 'string') return
                const message = JSON.parse(frame.payload) as ClientMessage
                if (message.type === 'move_to' && message.append) clicks.push(message.target)
            })
        })
        await page.setViewportSize(
            mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
        )
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate(
            (name) => window.__ratataTest!.join(name, 'vanguard'),
            `route-${info.project.name[0]}-${Number(mobile)}-${Date.now().toString(36)}`
        )
        const canvas = page.locator('canvas[data-game-canvas=true]')
        await expect(canvas).toBeVisible()
        const approach = await page.evaluate(
            (point) => window.__ratataTest!.navigate(point, { tolerance: 1, timeoutMs: 20_000 }),
            staging
        )
        expect(approach.status, approach.reason).toBe('arrived')
        expect(isSolid(grid, wall)).toBe(true)
        await page.evaluate(() =>
            window.__ratataTest!.send({ type: 'movement_mode', mode: 'sneaking' })
        )

        await page.evaluate(
            (point) => window.__ratataTest!.send({ type: 'move_to', target: point }),
            first
        )
        const screen = await page.evaluate(
            (point) => window.__ratataGameDebug!.worldToPage(point),
            wall
        )
        expect(screen).toBeDefined()
        await page.keyboard.down('Shift')
        await page.mouse.click(screen!.x, screen!.y)
        await page.keyboard.up('Shift')
        await expect.poll(() => clicks.length).toBe(1)
        const clicked = clicks[0]!
        expect(isSolid(grid, clicked)).toBe(true)
        await page.evaluate(
            (point) => window.__ratataTest!.send({ type: 'move_to', target: point, append: true }),
            last
        )
        await expect.poll(() => routeNumbers(page)).toEqual([1, 2, 3])
        const accepted = await page.evaluate(() =>
            window
                .__ratataTest!.getState()
                .player!.control!.route!.points.find((point) => point.number === 2)!
        )
        expect(accepted.number).toBe(2)
        expect(accepted.position).not.toEqual(clicked)
        expect(isSolid(grid, accepted.position)).toBe(false)
        expect(
            Math.hypot(
                (accepted.position.x - clicked.x) / grid.tileWidth,
                (accepted.position.y - clicked.y) / grid.tileHeight
            )
        ).toBeLessThanOrEqual(2)
        await expect(page.locator('.game-notice')).toContainText(
            'Точка 2 перенесена на ближайшее доступное место'
        )

        await page.screenshot({ path: info.outputPath('adjusted-route.png') })
        await expect.poll(() => routeNumbers(page), { timeout: 15_000 }).toEqual([2, 3])
        await expect.poll(() => routeNumbers(page), { timeout: 15_000 }).toEqual([3])
        await expect
            .poll(
                () => page.evaluate(() => window.__ratataTest!.getState().player!.control?.mode),
                { timeout: 15_000 }
            )
            .toBe('none')
        const position = await page.evaluate(() => window.__ratataTest!.getState().player!.position)
        expect(Math.hypot(position.x - last.x, position.y - last.y)).toBeLessThanOrEqual(1)
    })
}

async function routeNumbers(page: Page): Promise<number[]> {
    return page.evaluate(
        () =>
            window
                .__ratataTest!.getState()
                .player?.control?.route?.points.map((point) => point.number) ?? []
    )
}
function isSolid(map: MapVisibility, point: Vector2): boolean {
    return (
        map.solid[
            Math.floor(point.y / map.tileHeight) * map.width + Math.floor(point.x / map.tileWidth)
        ] === true
    )
}
