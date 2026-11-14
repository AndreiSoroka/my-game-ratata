import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
    CENTER_LOCATION_ID,
    readTrainingMapData,
    trainingAreaAt,
} from '@my-game-ratata/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { advanceCharacter } from '../src/game/movement'
import { loadNavigationService } from '../src/game/navigation'
import { playerSpawn } from '../src/game/spawns'
import { loadWorldObjects } from '../src/game/worldObjectData'

const mapRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../frontend/public/game/map'
)

function fixture() {
    return {
        width: 20,
        height: 20,
        tilewidth: 16,
        tileheight: 16,
        layers: [
            {
                name: 'Training grounds',
                objects: [
                    {
                        type: 'training_area',
                        x: 16,
                        y: 32,
                        width: 160,
                        height: 144,
                        properties: [{ name: 'areaId', value: 'yard' }],
                    },
                    {
                        type: 'training_dummy',
                        x: 136,
                        y: 104,
                        properties: [
                            { name: 'targetId', value: 'dummy' },
                            { name: 'areaId', value: 'yard' },
                            { name: 'visualId', value: 'training_dummy' },
                        ],
                    },
                ],
            },
        ],
    }
}

beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => vi.unstubAllGlobals())

describe('shared authored training semantics', () => {
    it('reads semantics without fence tiles or a city-specific location check', () => {
        const data = readTrainingMapData(fixture(), 'map-1-1')
        expect(data.areas).toEqual([
            {
                id: 'yard',
                locationId: 'map-1-1',
                bounds: { x: 16, y: 32, width: 160, height: 144 },
            },
        ])
        expect(data.targets).toEqual([
            {
                id: 'dummy',
                areaId: 'yard',
                locationId: 'map-1-1',
                position: { x: 136, y: 104 },
                visualId: 'training_dummy',
            },
        ])
        expect(
            readTrainingMapData({ ...fixture(), layers: [] }, 'other')
        ).toEqual({
            areas: [],
            targets: [],
        })
    })

    it('uses half-open inner bounds and requires the same location', () => {
        const { areas } = readTrainingMapData(fixture(), 'map-1-1')
        expect(trainingAreaAt(areas, 'map-1-1', { x: 16, y: 32 })?.id).toBe(
            'yard'
        )
        expect(
            trainingAreaAt(areas, 'map-1-1', { x: 175.9, y: 175.9 })?.id
        ).toBe('yard')
        expect(
            trainingAreaAt(areas, 'map-1-1', { x: 176, y: 80 })
        ).toBeUndefined()
        expect(
            trainingAreaAt(areas, 'map-1-1', { x: 80, y: 176 })
        ).toBeUndefined()
        expect(
            trainingAreaAt(areas, 'map-1-1', { x: 15.9, y: 80 })
        ).toBeUndefined()
        expect(
            trainingAreaAt(areas, 'map-2-2', { x: 80, y: 80 })
        ).toBeUndefined()
        expect(
            trainingAreaAt(areas, 'map-1-1', { x: NaN, y: 80 })
        ).toBeUndefined()
    })

    it.each([
        'duplicate ID',
        'outside area',
        'missing area',
        'unknown visual',
        'unknown object',
        'outside map',
        'zero bounds',
        'overlap',
    ])(
        'rejects %s instead of silently spawning an invalid target',
        (problem) => {
            const map = fixture()
            const objects = required(map.layers[0]).objects
            const area = required(objects[0])
            const target = required(objects[1])
            if (problem === 'duplicate ID') {
                required(target.properties[0]).value = 'yard'
            }
            if (problem === 'outside area') {
                target.x = 176
            }
            if (problem === 'missing area') {
                required(target.properties[1]).value = 'missing'
            }
            if (problem === 'unknown visual') {
                required(target.properties[2]).value = 'human'
            }
            if (problem === 'unknown object') {
                target.type = 'unsupported'
            }
            if (problem === 'outside map') {
                area.width = 400
            }
            if (problem === 'zero bounds') {
                area.height = 0
            }
            if (problem === 'overlap') {
                objects.push({
                    ...area,
                    properties: [{ name: 'areaId', value: 'second' }],
                })
            }
            expect(() => readTrainingMapData(map, 'map-1-1')).toThrow()
        }
    )
})

describe('Novogorod training ground placement', () => {
    it('authors a readable stable sign beside the entrance', () => {
        const sign = loadWorldObjects(CENTER_LOCATION_ID).find(
            (object) => object.id === `${CENTER_LOCATION_ID}:training:sign-1`
        )
        expect(sign).toMatchObject({
            kind: 'sign',
            name: 'Тренировочный загон',
            bounds: { x: 896, y: 752, width: 16, height: 16 },
        })
        expect(sign?.text).toContain('Внутри ограды')
    })

    it('keeps stable inner bounds, a target on the east side and the exact map1 alias', () => {
        const navigation = loadNavigationService()
        expect(navigation.grid.training).toEqual({
            areas: [
                {
                    id: `${CENTER_LOCATION_ID}:training:yard-1`,
                    locationId: CENTER_LOCATION_ID,
                    bounds: { x: 928, y: 704, width: 208, height: 192 },
                },
            ],
            targets: [
                {
                    id: `${CENTER_LOCATION_ID}:training:dummy-1`,
                    areaId: `${CENTER_LOCATION_ID}:training:yard-1`,
                    locationId: CENTER_LOCATION_ID,
                    position: { x: 1080, y: 792 },
                    visualId: 'training_dummy',
                },
            ],
        })
        expect(loadNavigationService('map1').grid.training).toEqual(
            navigation.grid.training
        )
        expect(fs.readFileSync(path.join(mapRoot, 'map1.json'), 'utf8')).toBe(
            fs.readFileSync(
                path.join(mapRoot, `${CENTER_LOCATION_ID}.json`),
                'utf8'
            )
        )
    })

    it('blocks the complete perimeter except the three-tile west entrance', () => {
        const navigation = loadNavigationService()
        for (let x = 57; x <= 71; x++) {
            expect(navigation.isSolidTile({ x, y: 43 })).toBe(true)
            expect(navigation.isSolidTile({ x, y: 56 })).toBe(true)
        }
        for (let y = 44; y <= 55; y++) {
            expect(navigation.isSolidTile({ x: 71, y })).toBe(true)
            expect(navigation.isSolidTile({ x: 57, y })).toBe(y < 48 || y > 50)
            for (let x = 58; x <= 70; x++) {
                expect(navigation.isSolidTile({ x, y })).toBe(false)
                expect(
                    navigation.grid.plantable?.[y * navigation.grid.width + x]
                ).toBe(false)
            }
        }
        const west = navigation.tileToWorld({ x: 56, y: 46 })
        expect(
            navigation.moveWithCollision(west, { x: 48, y: 0 }).x
        ).toBeLessThan(57 * 16)
        const entrance = navigation.tileToWorld({ x: 56, y: 49 })
        expect(navigation.moveWithCollision(entrance, { x: 48, y: 0 })).toEqual(
            { x: entrance.x + 48, y: entrance.y }
        )
        const dummy = required(required(navigation.grid.training).targets[0])
        // Being outside does not by itself block ordinary ranged attacks: the
        // west opening preserves LOS; the other fence sections still block it.
        expect(
            navigation.hasLineOfSight({ x: 920, y: 792 }, dummy.position)
        ).toBe(true)
        expect(
            navigation.hasLineOfSight({ x: 1152, y: 792 }, dummy.position)
        ).toBe(false)
    })

    it('walks from the ordinary spawn through the entrance to the dummy using shared movement', () => {
        const navigation = loadNavigationService()
        const target = required(
            required(navigation.grid.training).targets[0]
        ).position
        const actor = new GameCharacter({
            id: 'training-route-player',
            nickname: 'Training route',
            archetype: 'human',
            controllerKind: 'network_player',
            spawnPosition: playerSpawn(navigation, 1),
        })
        const route = navigation.findPathWorld(actor.position, target)
        expect(
            route.some((point) => {
                const tile = navigation.worldToTile(point)
                return tile.x === 57 && tile.y >= 48 && tile.y <= 50
            })
        ).toBe(true)
        actor.setPath(route)
        for (let now = 1000; now < 15000 && actor.hasPath(); now += 50) {
            advanceCharacter({ character: actor, navigation, now, deltaMs: 50 })
        }
        expect(actor.hasPath()).toBe(false)
        expect(actor.position).toEqual(target)
    })
})

function required<T>(value: T | undefined): T {
    if (value === undefined) {
        throw new Error('Missing test fixture')
    }
    return value
}
