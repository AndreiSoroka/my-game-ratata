import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
    CENTER_LOCATION_ID,
    encounterDifficulty,
    GRAVE_MAX_LIVING,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
    type EncounterMapObject,
    readEncounterData,
} from '../src/game/encounterData'
import { slimeHabitatTile } from '../src/game/encounterPlacement'
import { distance } from '../src/game/math'
import {
    loadNavigationService,
    NavigationService,
} from '../src/game/navigation'
import { createLocationEnemies } from '../src/game/worldSpawns'

interface SourceMap {
    width: number
    height: number
    tilewidth: number
    tileheight: number
    layers: Array<{
        name: string
        data?: number[]
        objects?: EncounterMapObject[]
    }>
}
const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../frontend/public/game/map'
)
function read(id: string): SourceMap {
    return JSON.parse(
        fs.readFileSync(path.join(root, `${id}.json`), 'utf8')
    ) as SourceMap
}
const property = (object: EncounterMapObject, name: string): unknown =>
    object.properties?.find((entry) => entry.name === name)?.value
beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => vi.unstubAllGlobals())

describe('semantic grave sources and natural-water habitats', () => {
    it.each(WORLD_LOCATION_DEFINITIONS)(
        '$id binds initial skeletons to rendered graves and places slimes by reachable natural water',
        (location) => {
            const map = read(location.id)
            const navigation = loadNavigationService(location.id)
            const content = navigation.grid.encounters
            expect(content).toBeDefined()
            const sources = content?.graves ?? []
            const enemies = createLocationEnemies(navigation, location)
            expect(enemies).toHaveLength(
                encounterDifficulty(location.dangerLevel).enemyCount
            )
            if (location.id === CENTER_LOCATION_ID) {
                expect(sources).toEqual([])
                expect(content?.slimeHabitats).toEqual([])
                return
            }
            expect(sources).toHaveLength(1)
            const source = sources[0]
            if (source === undefined) {
                throw new Error('Missing grave source')
            }
            const props =
                map.layers.find((layer) => layer.name === 'Depth props')
                    ?.objects ?? []
            const prop = props.find(
                (candidate) =>
                    candidate.x + candidate.width / 2 === source.position.x &&
                    candidate.y + candidate.height / 2 === source.position.y
            )
            expect(prop).toBeDefined()
            expect(source.propId).toBe(
                prop === undefined
                    ? 'missing-rendered-prop'
                    : property(prop, 'propId')
            )
            expect(source.propId).toBe(`${location.id}:prop:55:35`)
            expect(
                JSON.parse(
                    String(prop === undefined ? '[]' : property(prop, 'tiles'))
                )
            ).toContain(204)
            expect(source.id).toBe(`${location.id}:grave:55:35`)
            const skeletons = enemies.filter(
                ({ character }) => character.archetype === 'skeleton'
            )
            expect(skeletons.length).toBeLessThanOrEqual(GRAVE_MAX_LIVING)
            for (const { character, graveSourceId } of skeletons) {
                expect(graveSourceId).toBe(source.id)
                expect(character.respawnPolicy).toBe('none')
                expect(
                    distance(character.position, source.position)
                ).toBeLessThanOrEqual(96)
            }
            const terrain =
                map.layers.find((layer) => layer.name === 'Paths and ponds')
                    ?.data ?? []
            const habitats = content?.slimeHabitats ?? []
            expect(habitats.length).toBeGreaterThan(0)
            const slimes = enemies.filter(
                ({ character }) => character.archetype === 'slime'
            )
            for (const { character } of slimes) {
                expect(habitats).toContainEqual(character.position)
                expect(character.respawnPolicy).toBe('automatic')
                const { x, y } = navigation.worldToTile(character.position)
                expect(navigation.isSolidTile({ x, y })).toBe(false)
                expect(
                    [
                        terrain[y * map.width + x - 1],
                        terrain[y * map.width + x + 1],
                        terrain[(y - 1) * map.width + x],
                        terrain[(y + 1) * map.width + x],
                    ].some(
                        (gid) => gid !== undefined && gid >= 110 && gid < 134
                    )
                ).toBe(true)
                expect(
                    navigation
                        .findPathWorld(
                            { x: 48 * 16 + 8, y: 40 * 16 + 8 },
                            character.position
                        )
                        .at(-1)
                ).toEqual(character.position)
            }
            expect(
                new Set(
                    enemies.map(
                        ({ character }) =>
                            `${String(character.position.x)}:${String(character.position.y)}`
                    )
                ).size
            ).toBe(enemies.length)
        }
    )
})

it('rejects unsupported, duplicate, unrendered or off-map source metadata', () => {
    const original = read('map-0-0')
    for (const variant of [
        'unknown',
        'duplicate',
        'missing-prop',
        'outside',
    ] as const) {
        const map = structuredClone(original)
        const layer = map.layers.find((entry) => entry.name === 'Grave sources')
        const source = layer?.objects?.[0]
        if (source === undefined || layer?.objects === undefined) {
            throw new Error('Missing metadata fixture')
        }
        if (variant === 'unknown') {
            source.type = 'invented'
        }
        if (variant === 'duplicate') {
            layer.objects.push(structuredClone(source))
        }
        if (variant === 'missing-prop') {
            source.properties =
                source.properties?.filter((entry) => entry.name !== 'propId') ??
                []
        }
        if (variant === 'outside') {
            source.x = -1
        }
        expect(() => readEncounterData(map, 'map-0-0')).toThrow()
    }
})

it('preserves custom-map spawn fallback when no authored water habitat exists or candidates are blocked', () => {
    const navigation = new NavigationService({
        id: 'custom',
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(400).fill(false),
    })
    const fallback = { x: 8, y: 8 }
    expect(slimeHabitatTile(navigation, fallback, [])).toEqual(fallback)
    navigation.grid.encounters = {
        graves: [],
        slimeHabitats: [{ x: 88, y: 88 }],
    }
    navigation.grid.solid[5 * 20 + 5] = true
    expect(slimeHabitatTile(navigation, fallback, [])).toEqual(fallback)
})
