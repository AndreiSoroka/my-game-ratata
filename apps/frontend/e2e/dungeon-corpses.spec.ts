import assert from 'node:assert/strict'

import {
    CENTER_LOCATION_ID,
    REGION_NAME,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

import {
    generateDungeonFloors,
    generateDungeonMap,
    generateDungeonRegion,
} from '../../../scripts/generate-dungeons.mjs'
import {
    coverDungeonLoot,
    defeatDungeonMonster,
    recordDungeonDeaths,
} from './dungeon-corpse-combat'
import {
    closeDungeonContainer,
    cross,
    currentPassage,
    type DungeonMap,
    expectViewportFor,
    mapObjects,
    openDungeonContainer,
} from './dungeon-navigation'
import { walkTo } from './world-navigation'

const seed = 'dungeon-9'
const dungeons = generateDungeonRegion(seed, WORLD_LOCATION_DEFINITIONS)

if (process.env['GAME_WORLD_SEED'] === seed)
    test('the Fat Zombie stays on the floor and rises after a minute with its heart untaken', async ({
        page,
        browser,
        baseURL,
    }) => {
        test.setTimeout(350_000)
        const cityDungeon = dungeons.find(
            ({ surfaceLocationId }) => surfaceLocationId === CENTER_LOCATION_ID
        )!
        const [entrance, depth] = generateDungeonFloors(cityDungeon)
        assert(entrance && depth, 'The seeded tower has at least two floors')
        const authored = generateDungeonMap(depth, seed, REGION_NAME) as DungeonMap
        const spawns = mapObjects(authored, 'Dungeon spawns')
        const spawn = spawns.find(({ type }) => type === 'fat_zombie')!
        const collision = authored.layers.find(({ name }) => name === 'Collision')?.data
        assert(collision, 'The authored floor has a collision layer')
        const zombieId = `mob_fat_zombie_1_${depth.id}_1`
        const allies = await Promise.all([1, 2, 3].map(() => browser.newPage({ baseURL })))
        const party = [page, ...allies]
        const deaths = party.map(recordDungeonDeaths)
        try {
            await Promise.all(
                party.map(async (ranger, index) => {
                    await ranger.goto('/?test=1')
                    await ranger.waitForFunction(() => Boolean(window.__ratataTest))
                    await ranger.evaluate(
                        (name) => window.__ratataTest!.join(name, 'ranger'),
                        `Crypt ranger ${index + 1}`
                    )
                    for (const { id } of [entrance, depth]) {
                        await cross(ranger, await currentPassage(ranger, id))
                        await expectViewportFor(ranger, id)
                    }
                })
            )
            const skeletons = spawns
                .filter(({ type }) => type === 'skeleton')
                .map((position, index) => ({
                    id: `mob_skeleton_1_${depth.id}_${index + 1}`,
                    spawn: position,
                    width: authored.width,
                    collision,
                }))
                .reverse()
            const zombie = {
                id: zombieId,
                spawn,
                width: authored.width,
                collision,
            }
            for (const [index, skeleton] of skeletons.entries()) {
                const ranger = await defeatDungeonMonster(party, skeleton)
                await Promise.all([
                    takeSkeletonBone(ranger, skeleton.id),
                    coverDungeonLoot(
                        party.filter((ally) => ally !== ranger),
                        skeletons[index + 1] ?? zombie
                    ),
                ])
            }
            const witness = await defeatDungeonMonster(party, zombie)
            const death = deaths.flat().find(({ event }) => event.targetId === zombieId)
            assert(death?.event.eventId, 'A ranger observed the authoritative death')
            const body = await expectFallenMonster(witness, zombieId)
            await walkTo(witness, body.position, 14)
            const loot = await openDungeonContainer(witness, body.id)
            expect(loot.items.filter(({ itemId }) => itemId === 'zombie_heart')).toHaveLength(1)
            await closeDungeonContainer(witness, body.id)

            for (const id of [entrance.id, depth.id]) {
                await cross(witness, await currentPassage(witness, id))
                await expectViewportFor(witness, id)
            }
            await walkTo(witness, body.position, 14)
            expect(await expectFallenMonster(witness, zombieId)).toEqual(body)

            const risen = await witness.waitForFunction(
                ({ zombieId, corpseId }) => {
                    const { snapshot } = window.__ratataTest!.getState()
                    const zombie = snapshot?.characters.find(({ id }) => id === zombieId)
                    return (
                        zombie?.alive === true &&
                        snapshot &&
                        !snapshot.chests.some(({ id }) => id === corpseId) && {
                            health: zombie.health,
                            at: snapshot.serverTime,
                        }
                    )
                },
                { zombieId, corpseId: body.id },
                { timeout: 70_000 }
            )
            const revival = await risen.jsonValue()
            assert(revival, 'The same zombie returns as the body vanishes')
            expect(revival.health).toMatchObject({ kind: 'percent', percent: 50 })
            expect(revival.at - death.serverTime).toBeGreaterThanOrEqual(59_900)
            expect(
                new Set(
                    deaths
                        .flat()
                        .filter(({ event }) => event.targetId === zombieId)
                        .map(({ event }) => event.eventId)
                )
            ).toEqual(new Set([death.event.eventId]))
        } finally {
            await Promise.all(allies.map((ranger) => ranger.close()))
        }
    })

async function takeSkeletonBone(page: Page, id: string): Promise<void> {
    const body = await expectFallenMonster(page, id)
    await walkTo(page, body.position, 30)
    const chest = await openDungeonContainer(page, body.id)
    const bone = chest.items.find(({ itemId }) => itemId === 'bone')
    assert(bone, 'The fallen skeleton has its own bone')
    await page.evaluate(
        ({ chestId, itemInstanceId }) => {
            window.__ratataTest!.send({ type: 'take_chest_item', chestId, itemInstanceId })
        },
        { chestId: body.id, itemInstanceId: bone.instanceId }
    )
    await page.waitForFunction(
        (id) =>
            window
                .__ratataTest!.getState()
                .player?.inventory.some(({ instanceId }) => instanceId === id),
        bone.instanceId
    )
    await closeDungeonContainer(page, body.id)
}

async function expectFallenMonster(page: Page, id: string) {
    const result = await page.waitForFunction((id) => {
        const { snapshot } = window.__ratataTest!.getState()
        const actor = snapshot?.characters.find((entry) => entry.id === id)
        const body = snapshot?.chests.find(({ corpse }) => corpse?.characterId === id)
        return (
            actor?.alive === false &&
            actor.animation.action === 'death' &&
            window.__ratataGameDebug?.characterOpacity?.(id) === 0.55 &&
            body && { id: body.id, position: body.position }
        )
    }, id)
    const body = await result.jsonValue()
    assert(body, 'The dead monster and its lootable corpse are visible')
    return body
}
