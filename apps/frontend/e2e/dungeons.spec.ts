import assert from 'node:assert/strict'

import {
    CENTER_LOCATION_ID,
    type ChestContainerSnapshot,
    type GameEventPayload,
    REGION_NAME,
    type ServerMessage,
    type Vector2,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

import {
    generateDungeonFloors,
    generateDungeonMap,
    generateDungeonRegion,
} from '../../../scripts/generate-dungeons.mjs'
import { walkTo } from './world-navigation'

interface Passage extends Vector2 {
    properties: { name: string; value: unknown }[]
}
interface DungeonMap {
    tileheight: number
    layers: { name: string; objects?: Passage[] }[]
}

const branId = 'npc_veteran_1'
const seed = process.env['GAME_WORLD_SEED'] ?? 'fortifications-browser-2026'
const dungeons = generateDungeonRegion(seed, WORLD_LOCATION_DEFINITIONS)

test('walks through a tower and every floor with Bran and a working viewport', async ({ page }) => {
    test.setTimeout(240_000)
    let branAccepted = false
    page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname !== '/ws') return
        socket.on('framereceived', ({ payload }) => {
            const message = JSON.parse(String(payload)) as ServerMessage
            if (
                message.type === 'event' &&
                message.event.kind === 'chat' &&
                message.event.actorId === branId &&
                message.event.text === 'Согласен идти вместе.'
            ) {
                branAccepted = true
            }
        })
    })
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.evaluate(() => window.__ratataTest!.join('Dungeon explorer', 'vanguard'))
    await expect.poll(() => playerLocation(page)).toBe(CENTER_LOCATION_ID)
    const playerId = await page.evaluate(() => window.__ratataTest!.getState().player!.id)
    await inviteBran(page)
    await expect.poll(() => branAccepted).toBe(true)

    const parents = new Set(dungeons.map((d) => d.surfaceLocationId))
    const nearest = WORLD_LOCATION_DEFINITIONS.filter((entry) => parents.has(entry.id)).sort(
        (a, b) => a.dangerLevel - b.dangerLevel
    )[0]!
    const city = WORLD_LOCATION_DEFINITIONS.find((entry) => entry.id === CENTER_LOCATION_ID)!
    for (const [steps, negative, positive] of [
        [nearest.column - city.column, 'west', 'east'],
        [nearest.row - city.row, 'north', 'south'],
    ] as const) {
        for (let step = 0; step < Math.abs(steps); step++) {
            const result = await page.evaluate(
                (direction) => window.__ratataTest!.travel(direction, { timeoutMs: 30_000 }),
                steps < 0 ? negative : positive
            )
            expect(result, result.reason).toMatchObject({ status: 'arrived' })
        }
    }

    const dungeon = dungeons.find((d) => d.surfaceLocationId === nearest.id)!
    const floors = generateDungeonFloors(dungeon)
    const route = [
        ...floors.map(({ id }) => id),
        ...floors
            .slice(0, -1)
            .reverse()
            .map(({ id }) => id),
    ]
    for (const destination of route) {
        const previous = await playerLocation(page)
        await cross(page, await currentPassage(page, destination))
        await expectViewportFor(page, destination)
        await expectBranInLocation(page, destination)
        expect(await page.evaluate(() => window.__ratataTest!.observe().exits)).toEqual([])
        await expectAwayFromThreshold(page, await currentPassage(page, previous!))
    }
    await cross(page, await currentPassage(page, nearest.id))
    await expectViewportFor(page, nearest.id)
    await expectBranInLocation(page, nearest.id)
    expect(await page.evaluate(() => window.__ratataTest!.getState().player!.id)).toBe(playerId)
})

if (seed === 'dungeon-832')
    test('hears nested walls and preserves the remaining loot after travel and reload', async ({
        page,
    }) => {
        test.setTimeout(180_000)
        const first = generateDungeonFloors(
            dungeons.find(({ surfaceLocationId }) => surfaceLocationId === CENTER_LOCATION_ID)!
        )[0]!
        const authored = generateDungeonMap(first, seed, REGION_NAME) as DungeonMap
        const secretWalls = mapObjects(authored, 'Dungeon secrets')
        expect(secretWalls).toHaveLength(2)
        const secrets = secretWalls.map((wall) => ({
            x: wall.x,
            y: wall.y,
            id: String(property(wall, 'id')),
        }))
        const finalId = secrets.at(-1)!.id
        const chestId = `${finalId}:chest`
        const { x, y } = JSON.parse(String(property(secretWalls.at(-1)!, 'chest'))) as Vector2
        const chestApproach = { x, y: y + 24 }

        let explorer = ''
        const combat = observeCombat(page, () => explorer)
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate(() => window.__ratataTest!.join('Secret explorer', 'vanguard'))
        explorer = await page.evaluate(() => window.__ratataTest!.getState().localPlayerId!)
        await cross(page, await currentPassage(page, first.id))
        await expectViewportFor(page, first.id)
        const publicMap = await currentMap(page)
        expect(publicMap.layers.some(({ name }) => name === 'Dungeon secrets')).toBe(false)

        for (const [index, wall] of secrets.entries()) {
            await approachWall(page, wall, authored.tileheight)
            await expectNoSecretTarget(page, wall)
            expect(await secretState(page, finalId)).toEqual({
                revealed: secrets.slice(0, index).map(({ id }) => id),
                chest: false,
                guards: 0,
            })
            await page.waitForFunction(
                () => window.__ratataTest!.getState().player?.cooldowns.attackMsLeft === 0
            )
            await page.evaluate(() => window.__ratataTest!.send({ type: 'attack' }))
            await expectReveal(page, finalId, combat, {
                revealed: secrets.slice(0, index + 1).map(({ id }) => id),
                chest: index === secrets.length - 1,
                guards: index === secrets.length - 1 ? 2 : 0,
            })
            expect(await hearsDraft(page), 'Opening the wall clears the draft').toBe(false)
        }

        await walkTo(page, chestApproach, 3)
        const opened = await openSecretChest(page, chestId)
        expect(opened.items).toHaveLength(3)
        const [taken, ...remaining] = opened.items
        await page.evaluate(
            ({ chestId, itemInstanceId }) =>
                window.__ratataTest!.send({ type: 'take_chest_item', chestId, itemInstanceId }),
            { chestId, itemInstanceId: taken!.instanceId }
        )
        await expect.poll(async () => (await currentSecretChest(page))?.items).toEqual(remaining)
        await expectLootInBag(page, taken!.instanceId)
        await closeSecretChest(page, chestId)

        await cross(page, await currentPassage(page, CENTER_LOCATION_ID))
        await expectViewportFor(page, CENTER_LOCATION_ID)
        await cross(page, await currentPassage(page, first.id))
        await expectViewportFor(page, first.id)
        expect((await secretState(page, finalId)).revealed).toEqual(secrets.map(({ id }) => id))
        const finalWall = secrets.at(-1)!
        await walkTo(page, { x: finalWall.x, y: finalWall.y + 16 }, 3)
        await expect
            .poll(() =>
                page.evaluate(
                    (id) =>
                        window
                            .__ratataTest!.getState()
                            .snapshot?.chests.find((chest) => chest.id === id)?.itemCount,
                    chestId
                )
            )
            .toBe(remaining.length)

        await page.reload()
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await expectViewportFor(page, first.id)
        expect((await secretState(page, finalId)).revealed).toEqual(secrets.map(({ id }) => id))
        await walkTo(page, chestApproach, 3)
        expect((await openSecretChest(page, chestId)).items).toEqual(remaining)
        await expectLootInBag(page, taken!.instanceId)
    })

function hearsDraft(page: Page) {
    return page.evaluate(() => {
        const { snapshot } = window.__ratataTest!.getState()
        return snapshot && snapshot.dungeonDraft === true
    })
}

function currentSecretChest(page: Page) {
    return page.evaluate(() => window.__ratataTest!.getState().snapshot?.chest)
}

async function openSecretChest(page: Page, chestId: string): Promise<ChestContainerSnapshot> {
    const result = await page.evaluate(
        (chestId) =>
            window.__ratataTest!.act(
                { type: 'open_chest', chestId },
                { until: { type: 'chest', chestId } }
            ),
        chestId
    )
    expect(result.status, result.reason).toBe('condition_met')
    const chest = await currentSecretChest(page)
    assert(chest?.chestId === chestId, 'The discovered chest is open')
    return chest
}

async function closeSecretChest(page: Page, chestId: string): Promise<void> {
    const result = await page.evaluate(
        (chestId) =>
            window.__ratataTest!.act(
                { type: 'close_chest', chestId },
                { until: { type: 'chest', chestId: null } }
            ),
        chestId
    )
    expect(result.status, result.reason).toBe('condition_met')
}

async function expectLootInBag(page: Page, instanceId: string): Promise<void> {
    await expect
        .poll(() =>
            page.evaluate(
                (id) =>
                    window
                        .__ratataTest!.getState()
                        .player?.inventory.filter((item) => item.instanceId === id).length,
                instanceId
            )
        )
        .toBe(1)
}

async function inviteBran(page: Page): Promise<void> {
    const tavern = await page.waitForFunction(() =>
        window
            .__ratataTest!.observe()
            .targets.find(
                (target) => target.kind === 'building' && target.name.includes('Три дороги')
            )
    )
    const entrance = await tavern.jsonValue()
    assert(entrance, 'The tavern has an authored entrance')
    await walkTo(page, entrance.position, 4)
    const nearbyBran = await page.waitForFunction(
        (id) => window.__ratataTest!.observe().targets.find((target) => target.id === id),
        branId
    )
    const target = await nearbyBran.jsonValue()
    assert(target, 'Bran is visible at the tavern')
    await walkTo(page, target.position, 18)
    await page.evaluate(
        (targetId) =>
            window.__ratataTest!.send({
                type: 'chat',
                targetId,
                text: 'я хочу отправится в подземелье, пойдем со мной',
            }),
        branId
    )
}

async function expectBranInLocation(page: Page, locationId: string): Promise<void> {
    await expect
        .poll(
            () =>
                page.evaluate(
                    ({ branId, locationId }) => {
                        const { snapshot } = window.__ratataTest!.getState()
                        return (
                            snapshot?.location?.id === locationId &&
                            snapshot.characters.some((actor) => actor.id === branId && actor.alive)
                        )
                    },
                    { branId, locationId }
                ),
            { timeout: 30_000, message: `Bran follows into ${locationId}` }
        )
        .toBe(true)
}

function playerLocation(page: Page) {
    return page.evaluate(() => window.__ratataTest!.getState().location?.id)
}

async function expectViewportFor(page: Page, locationId: string): Promise<void> {
    await expect
        .poll(
            () =>
                page.evaluate(() => {
                    const { connected, mapReady, snapshot } = window.__ratataTest!.getState()
                    return {
                        connected,
                        mapReady,
                        location: snapshot?.location?.id,
                        viewport: snapshot?.viewBounds !== undefined,
                    }
                }),
            { timeout: 15_000, message: `Receive a camera-filtered snapshot for ${locationId}` }
        )
        .toEqual({ connected: true, mapReady: true, location: locationId, viewport: true })
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid viewport hint' })).toHaveCount(
        0
    )
}

async function currentMap(page: Page): Promise<DungeonMap> {
    await page.waitForFunction(() => {
        const state = window.__ratataTest!.getState()
        return state.mapReady && state.location?.map.asset.url
    })
    const assetPath = await page.evaluate(
        () => window.__ratataTest!.getState().location!.map.asset.url
    )
    const base = process.env['E2E_BACKEND_PORT'] ?? '3500'
    const response = await page.request.get(`http://127.0.0.1:${base}${assetPath}`)
    expect(response.ok()).toBe(true)
    return (await response.json()) as DungeonMap
}

function mapObjects(map: DungeonMap, layer: string): Passage[] {
    return map.layers.find(({ name }) => name === layer)?.objects ?? []
}

function property(object: Passage, key: string): unknown {
    return object.properties.find(({ name }) => name === key)?.value
}

async function currentPassage(page: Page, destination: string): Promise<Passage> {
    const point = mapObjects(await currentMap(page), 'Dungeon passages').find(
        (passage) => property(passage, 'destinationLocationId') === destination
    )
    expect(point, `Passage to ${destination}`).toBeDefined()
    return point!
}

async function cross(page: Page, { x, y }: Vector2): Promise<void> {
    const result = await page.evaluate(
        (point) => window.__ratataTest!.navigate(point, { timeoutMs: 30_000, tolerance: 1 }),
        { x, y }
    )
    expect(result, result.reason).toMatchObject({ status: 'location_changed' })
}

async function expectAwayFromThreshold(page: Page, passage: Passage): Promise<void> {
    const point = await page.evaluate(() => window.__ratataTest!.getState().player!.position)
    expect(Math.hypot(point.x - passage.x, point.y - passage.y)).toBeGreaterThan(
        Number(property(passage, 'triggerRadius') ?? 7)
    )
}

async function approachWall(page: Page, wall: Vector2, tileHeight: number): Promise<void> {
    const outside = { x: wall.x, y: wall.y + 2 * tileHeight }
    const nearby = { x: wall.x, y: wall.y + 1.25 * tileHeight }
    const against = { x: wall.x, y: wall.y + tileHeight - 1 }
    await walkTo(page, outside, 1)
    await atRest(page, outside)

    await Promise.all([
        page.waitForFunction(
            ({ wallY, tileHeight }) => {
                const { player, snapshot } = window.__ratataTest!.getState()
                return (
                    snapshot?.dungeonDraft === true &&
                    player &&
                    player.position.y - wallY > tileHeight &&
                    Math.hypot(player.velocity.x, player.velocity.y) > 0
                )
            },
            { wallY: wall.y, tileHeight }
        ),
        walkTo(page, nearby, 1),
    ])
    expect(
        (await atRest(page, nearby)).draft,
        'Stopping outside the touch range clears the draft'
    ).toBe(false)

    await walkTo(page, against, 1)
    const stopped = await atRest(page, against)
    expect(stopped).toMatchObject({ draft: true, facing: 'up' })
    const stayed = await atRest(page, against, stopped.tick + 12)
    expect(stayed.draft, 'Stationary against the closed wall after several server updates').toBe(
        true
    )
}

async function atRest(page: Page, point: Vector2, earliestTick = 0) {
    const settled = await page.waitForFunction(
        ({ point, earliestTick }) => {
            const { player, snapshot } = window.__ratataTest!.getState()
            if (
                !player ||
                !snapshot ||
                snapshot.tick < earliestTick ||
                player.path.length !== 0 ||
                player.velocity.x !== 0 ||
                player.velocity.y !== 0 ||
                Math.hypot(player.position.x - point.x, player.position.y - point.y) > 1
            )
                return false
            return {
                tick: snapshot.tick,
                draft: snapshot.dungeonDraft === true,
                facing: player.facing,
            }
        },
        { point, earliestTick }
    )
    const observation = await settled.jsonValue()
    assert(observation, 'The server reported the player at rest')
    return observation
}

async function expectNoSecretTarget(page: Page, wall: Vector2): Promise<void> {
    const selectable = await page.evaluate(
        ({ x, y }) =>
            window
                .__ratataTest!.observe()
                .targets.some(
                    ({ position, kind }) =>
                        kind !== 'character' && Math.hypot(position.x - x, position.y - y) < 8
                ),
        wall
    )
    expect(selectable).toBe(false)
}

async function secretState(page: Page, id: string) {
    return page.evaluate((id) => {
        const snapshot = window.__ratataTest!.getState().snapshot!
        return {
            revealed: (snapshot.dungeonReveals ?? []).map(({ id }) => id),
            chest: snapshot.chests.some((chest) => chest.id === `${id}:chest`),
            guards: snapshot.characters.filter(({ id: actorId }) =>
                actorId.startsWith(`mob_skeleton_1_${id}_`)
            ).length,
        }
    }, id)
}

function observeCombat(page: Page, actorId: () => string): GameEventPayload[] {
    const result: GameEventPayload[] = []
    page.on('websocket', (socket) => {
        socket.on('framereceived', ({ payload }) => {
            const message = JSON.parse(String(payload)) as ServerMessage
            if (message.type === 'event' && message.event.actorId === actorId())
                result.push(message.event)
        })
    })
    return result
}

async function expectReveal(
    page: Page,
    id: string,
    events: GameEventPayload[],
    expected: Awaited<ReturnType<typeof secretState>>
): Promise<void> {
    try {
        await expect.poll(() => secretState(page, id)).toEqual(expected)
    } catch (error) {
        const actor = await page.evaluate(() => {
            const { player } = window.__ratataTest!.getState()
            return (
                player && {
                    position: player.position,
                    facing: player.facing,
                    weapon: player.equipment.weapon,
                    resources: player.resources,
                    cooldowns: player.cooldowns,
                    combat: player.combat,
                }
            )
        })
        throw new Error(JSON.stringify({ actor, events: events.slice(-8) }, null, 2), {
            cause: error,
        })
    }
}
