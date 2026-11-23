import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import { loadNavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import { playerSpawn } from '../src/game/spawns'
import { npcReply } from './npcAiRuntimeFixture'
import { joinScenarioRoom } from './scenarioRoomHelpers'

interface Building {
    name: string
    x: number
    y: number
    width: number
    height: number
    properties: Array<{ name: string; value: string | number }>
}
interface CityMap {
    layers: Array<{ name: string; objects?: Building[] }>
}
const mapPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    `../../frontend/public/game/map/${CENTER_LOCATION_ID}.json`
)
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8')) as CityMap
const buildings =
    map.layers.find((layer) => layer.name === 'Buildings')?.objects ?? []

beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function point(building: Building, kind: 'entry' | 'interior') {
    const coordinate = (axis: string) =>
        Number(
            building.properties.find(
                (property) => property.name === `${kind}${axis}`
            )?.value
        )
    return { x: coordinate('X'), y: coordinate('Y') }
}

function contains(
    building: Building,
    position: { x: number; y: number }
): boolean {
    return (
        position.x > building.x &&
        position.x < building.x + building.width &&
        position.y > building.y &&
        position.y < building.y + building.height
    )
}

describe('inhabited city interiors', () => {
    it('has eleven inhabited buildings with door-only passages through their perimeters', () => {
        const navigation = loadNavigationService()
        const residents = new GameRoom(navigation).snapshot().characters
        const start = playerSpawn(navigation, 1)
        expect(buildings).toHaveLength(11)
        for (const building of buildings) {
            const entry = point(building, 'entry')
            const interior = point(building, 'interior')
            const route = navigation.findPathWorld(start, interior)
            expect(route.at(-1), building.name).toEqual(interior)
            expect(route, building.name).toContainEqual(entry)
            const occupants = residents.filter((resident) =>
                contains(building, resident.position)
            )
            expect(occupants.length, building.name).toBeGreaterThan(0)
            for (const resident of occupants) {
                expect(
                    navigation.findPathWorld(start, resident.position).at(-1)
                ).toEqual(resident.position)
            }
            for (
                let x = building.x + 8;
                x < building.x + building.width;
                x += 16
            ) {
                for (const y of [
                    building.y + 8,
                    building.y + building.height - 8,
                ]) {
                    expect(
                        navigation.isSolidTile(
                            navigation.worldToTile({ x, y })
                        ),
                        building.name
                    ).toBe(x !== entry.x || y !== entry.y)
                }
            }
            for (
                let y = building.y + 8;
                y < building.y + building.height;
                y += 16
            ) {
                for (const x of [
                    building.x + 8,
                    building.x + building.width - 8,
                ]) {
                    expect(
                        navigation.isSolidTile(
                            navigation.worldToTile({ x, y })
                        ),
                        building.name
                    ).toBe(true)
                }
            }
        }
    })

    it('lets a nearby smith answer through the model and retain only smith services', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000)
        const room = new GameRoom(loadNavigationService(), {
            ai: {
                config: parseNpcAiConfig(
                    { npcs: [{ actorId: 'npc_smith_1', role: 'advisor' }] },
                    true
                ),
                provider: {
                    decide: () =>
                        Promise.resolve(
                            npcReply(null, {
                                speech: 'Привет. Я кузнец Игнат.',
                            })
                        ),
                },
            },
        })
        const npc = room.getCharacter('npc_smith_1')
        if (npc === undefined) {
            throw new Error('Missing smith')
        }
        const visitor = joinScenarioRoom(room, 'Visitor')
        const hero = visitor.actor
        // This test exercises contacts and services after both actors are inside the smithy.
        hero.position = { ...npc.position }
        const service = room.adventureForWorkers()
        room.start()
        try {
            visitor.send({ type: 'interact', targetId: npc.id })
            await vi.advanceTimersByTimeAsync(150)
            expect(
                visitor.sent.find(
                    (message) =>
                        message.type === 'event' &&
                        message.event.kind === 'chat' &&
                        message.event.actorId === npc.id
                )
            ).toBeDefined()
            expect(service.snapshot(hero.id).dialogue).toMatchObject({
                npcId: npc.id,
                canTrade: true,
                text: 'Привет. Я кузнец Игнат.',
            })
            expect(service.snapshot(hero.id).dialogue?.choices).toContainEqual({
                id: 'repair',
                label: 'Почини моё снаряжение',
                labelMessage: { key: 'authored.dialogue.repair' },
            })
            service.grantGoldOnce(hero.id, 100, 'test-payment')
            service.trade(hero, 'food', [npc])
            expect(service.snapshot(hero.id).gold).toBe(100)
            expect(hero.inventory).toHaveLength(0)
            npc.soul.canSpeak = false
            expect(service.interact(hero, npc.id, [npc])).toEqual([])
            expect(service.snapshot(hero.id).notice).toContain('Подойди')
        } finally {
            room.stop()
        }
    })
})
