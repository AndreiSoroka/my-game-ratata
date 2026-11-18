import { writeFile } from 'node:fs/promises'

import {
    CENTER_LOCATION_ID,
    type ServerMessage,
    type Vector2,
    WORLD_DIRECTIONS,
    type WorldDirection,
    worldLocationNeighbor,
} from '@my-game-ratata/contracts'
import { expect, type Page, test, type TestInfo } from '@playwright/test'

interface MapObject {
    id: number
    type: string
    name: string
    x: number
    y: number
    width: number
    height: number
    properties?: { name: string; value: unknown }[]
}
interface CityMap {
    width: number
    height: number
    tilewidth: number
    tileheight: number
    layers: { name: string; objects?: MapObject[] }[]
}
interface TracePoint {
    x: number
    y: number
    locationId?: string
}

for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
]) {
    test(`draws all fortifications, walks four gates and hides only entered roofs (${String(viewport.width)}px)`, async ({
        page,
    }, info) => {
        test.setTimeout(240_000)
        await page.setViewportSize(viewport)
        const positions = capturePositions(page)
        const city = await enterCity(page, viewport.width)
        const objects = city.layers.find((layer) => layer.name === 'Fortifications')!.objects!
        const gates = objects.filter((object) => object.type === 'gate')
        const corners = objects.filter((object) => object.type === 'corner_tower')
        const buildings = city.layers.find((layer) => layer.name === 'Buildings')!.objects!
        expect(gates).toHaveLength(4)
        expect(corners).toHaveLength(4)
        expect(objects.filter((object) => object.type === 'gate_leaf')).toHaveLength(8)
        expect(
            objects
                .filter((object) => object.type === 'gate_support')
                .every(
                    (object) =>
                        object.width === 2 * city.tilewidth && object.height === 2 * city.tileheight
                )
        ).toBe(true)
        expect(await page.evaluate(() => window.__ratataGameDebug?.setCameraZoom?.(1))).toBe(true)
        const evidence = []
        for (const gate of gates) {
            const direction = property(gate, 'direction') as WorldDirection
            const opening = JSON.parse(String(property(gate, 'opening'))) as {
                x: number
                y: number
                w: number
                h: number
            }
            const center = {
                x: (opening.x + opening.w / 2) * city.tilewidth,
                y: (opening.y + opening.h / 2) * city.tileheight,
            }
            const normal = WORLD_DIRECTIONS[direction]
            const inside = {
                x: center.x - normal.x * city.tilewidth * 4,
                y: center.y - normal.y * city.tileheight * 4,
            }
            const outside = {
                x: center.x + normal.x * city.tilewidth * 4,
                y: center.y + normal.y * city.tileheight * 4,
            }
            await walk(page, inside)
            await screenshot(page, `gate-${direction}`, viewport.width, info)
            const start = positions.length
            await walk(page, outside)
            const crossing = positions
                .slice(start)
                .find(
                    (point) =>
                        Math.abs(normal.x ? point.x - center.x : point.y - center.y) <=
                        city.tilewidth
                )
            expect(crossing, `Observed crossing through ${direction} gate`).toBeDefined()
            expect(
                Math.abs(normal.x ? crossing!.y - center.y : crossing!.x - center.x)
            ).toBeLessThanOrEqual(city.tilewidth * 1.5)
            expect(crossing!.locationId).toBe(CENTER_LOCATION_ID)
            evidence.push({ direction, center, inside, outside, crossing })
            await walk(page, inside)
            const landmark = city.layers
                .find((layer) => layer.name === 'City landmarks')!
                .objects!.find((object) => property(object, 'direction') === direction)!
            expect(property(landmark, 'destinationLocationId')).toBe(
                worldLocationNeighbor(CENTER_LOCATION_ID, direction)?.id
            )
            await enterNearestHouse(page, buildings, inside, direction, viewport.width, info)
        }
        for (const corner of corners) {
            expect(corner.width).toBe(city.tilewidth * 3)
            expect(corner.height).toBe(city.tileheight * 3)
            const east = corner.x < (city.width * city.tilewidth) / 2
            const south = corner.y < (city.height * city.tileheight) / 2
            await walk(page, {
                x: east
                    ? corner.x + corner.width + city.tilewidth * 1.5
                    : corner.x - city.tilewidth * 1.5,
                y: south
                    ? corner.y + corner.height + city.tileheight * 2.5
                    : corner.y - city.tileheight * 2.5,
            })
            await screenshot(page, corner.name, viewport.width, info)
        }
        await info.attach('ordinary-gate-crossings.json', {
            body: Buffer.from(JSON.stringify(evidence, null, 2)),
            contentType: 'application/json',
        })
    })
}

function property(object: MapObject, name: string): unknown {
    return object.properties?.find((entry) => entry.name === name)?.value
}
async function enterCity(page: Page, width: number): Promise<CityMap> {
    let mapUrl = ''
    page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/world/maps/')) mapUrl = request.url()
    })
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.evaluate(
        (name) => window.__ratataTest!.join(name, 'vanguard'),
        `fort-${String(width)}-${Date.now().toString(36)}`
    )
    await expect(page.locator('canvas[data-game-canvas=true]')).toBeVisible({ timeout: 15_000 })
    const response = await page.request.get(mapUrl)
    expect(response.ok()).toBe(true)
    return (await response.json()) as CityMap
}
async function walk(page: Page, position: Vector2): Promise<void> {
    const result = await page.evaluate(
        (point) => window.__ratataTest!.navigate(point, { tolerance: 1, timeoutMs: 25_000 }),
        position
    )
    expect(result.status, `${JSON.stringify(position)}: ${result.reason}`).toBe('arrived')
    expect(result.locationId).toBe(CENTER_LOCATION_ID)
}
async function screenshot(page: Page, name: string, width: number, info: TestInfo): Promise<void> {
    const image = await page.evaluate(() => window.__ratataGameDebug?.captureFrame?.())
    expect(image).toMatch(/^data:image\/png;base64,/)
    const path = `/private/tmp/ratata-city-${String(width)}-${name}.png`
    await writeFile(path, Buffer.from(image!.split(',')[1]!, 'base64'))
    await info.attach(name, { path, contentType: 'image/png' })
}
async function enterNearestHouse(
    page: Page,
    buildings: MapObject[],
    from: Vector2,
    gate: string,
    width: number,
    info: TestInfo
): Promise<void> {
    const nearest = [...buildings].sort(
        (left, right) =>
            Math.hypot(
                Number(property(left, 'entryX')) - from.x,
                Number(property(left, 'entryY')) - from.y
            ) -
            Math.hypot(
                Number(property(right, 'entryX')) - from.x,
                Number(property(right, 'entryY')) - from.y
            )
    )[0]!
    await walk(page, {
        x: Number(property(nearest, 'entryX')),
        y: Number(property(nearest, 'entryY')),
    })
    await walk(page, {
        x: Number(property(nearest, 'interiorX')),
        y: Number(property(nearest, 'interiorY')),
    })
    await expect
        .poll(() =>
            page.evaluate(() =>
                window.__ratataGameDebug
                    ?.buildingCovers?.()
                    .filter((cover) => !cover.visible)
                    .map((cover) => cover.id)
            )
        )
        .toEqual([String(nearest.id)])
    await screenshot(page, `gate-${gate}-roof-hidden`, width, info)
    await walk(page, {
        x: Number(property(nearest, 'entryX')),
        y: Number(property(nearest, 'entryY')),
    })
}
function capturePositions(page: Page): TracePoint[] {
    const positions: TracePoint[] = []
    let playerId = ''
    page.on('websocket', (socket) =>
        socket.on('framereceived', (frame) => {
            if (typeof frame.payload !== 'string') return
            const message = JSON.parse(frame.payload) as ServerMessage
            if (message.type === 'world_init') playerId = message.playerId
            if (message.type !== 'world_init' && message.type !== 'snapshot') return
            const player = message.snapshot.characters.find((actor) => actor.id === playerId)
            if (player)
                positions.push({ ...player.position, locationId: message.snapshot.location?.id })
        })
    )
    return positions
}
