import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import {
    CENTER_LOCATION_ID,
    type DungeonSize,
    type MapSummary,
    REGION_NAME,
    WESTERN_RUINS_LOCATION_ID,
    WORLD_LOCATION_DEFINITIONS,
    type WorldLocationDefinition,
} from '@my-game-ratata/contracts'

import {
    type DungeonDefinition,
    generateDungeonMap,
    generateDungeonRegion,
} from '../../../../scripts/generate-dungeons.mjs'
import {
    type CityLayoutStyle,
    generateCity,
    generateWorldMap,
} from '../../../../scripts/generate-map.mjs'
import { createAdventureResourceNodes } from './adventureResourceData'
import type { AdventureServiceOptions } from './adventureWorld'
import { readHarvestSources } from './harvestData'
import { NavigationService, resolveMapRoot } from './navigation'
import { buildGrid, type TiledMap } from './navigationGrid'
import { serverEpoch } from './serverEpoch'
import { readWorldObjects } from './worldObjectData'

export interface WorldMapOptions {
    seed?: string
    epoch?: string
    mapRoot?: string
    cityStyle?: CityLayoutStyle
}

export interface WorldMapAsset {
    body: string
    revision: string
}

export interface DungeonLocationDefinition extends WorldLocationDefinition {
    biome: 'dungeon'
    dungeonSize: DungeonSize
    surfaceLocationId: string
}

interface Entry extends WorldMapAsset {
    source: TiledMap
    navigation: NavigationService
}

export function resolveWorldSeed(seed?: string): string {
    if (seed === undefined) {
        return randomUUID()
    }
    if (seed.trim().length === 0 || seed.length > 256 || seed.includes('\0')) {
        throw new Error('GAME_WORLD_SEED must contain 1–256 characters')
    }
    return seed
}

/** One immutable authored map per location; mutable gameplay state lives in room services. */
export class WorldMaps {
    public readonly seed: string
    public readonly epoch: string
    public readonly dungeons: readonly DungeonLocationDefinition[]
    private readonly entries = new Map<string, Entry>()

    public constructor(options: WorldMapOptions = {}) {
        this.seed = resolveWorldSeed(options.seed)
        this.epoch = options.epoch ?? serverEpoch
        if (!/^[a-zA-Z0-9_-]{1,100}$/u.test(this.epoch)) {
            throw new Error('Invalid world epoch')
        }
        const mapRoot = options.mapRoot ?? resolveMapRoot()
        const dungeons =
            options.mapRoot === undefined
                ? generateDungeonRegion(this.seed, WORLD_LOCATION_DEFINITIONS)
                : []
        for (const definition of WORLD_LOCATION_DEFINITIONS) {
            const { id } = definition
            const dungeonEntrance = dungeons.find(
                (dungeon) => dungeon.surfaceLocationId === id
            )
            this.add(
                id,
                surfaceMap(
                    definition,
                    options,
                    this.seed,
                    mapRoot,
                    dungeonEntrance
                )
            )
        }
        this.dungeons = dungeons.map((dungeon) => {
            const surface = WORLD_LOCATION_DEFINITIONS.find(
                ({ id }) => id === dungeon.surfaceLocationId
            )
            if (surface === undefined) {
                throw new Error(
                    `Unknown dungeon surface: ${dungeon.surfaceLocationId}`
                )
            }
            this.add(
                dungeon.id,
                generateDungeonMap(dungeon, this.seed, REGION_NAME)
            )
            return {
                id: dungeon.id,
                name: dungeon.name,
                biome: 'dungeon',
                dungeonSize: dungeon.size,
                column: surface.column,
                row: surface.row,
                dangerLevel: dungeon.dangerLevel,
                surfaceLocationId: surface.id,
            }
        })
    }

    private add(id: string, value: unknown): void {
        const source = readMap(value)
        const body = JSON.stringify(source)
        const revision = createHash('sha256').update(body).digest('hex')
        const asset: MapSummary['asset'] = {
            url: `/world/maps/${this.epoch}/${id}.json`,
            revision,
        }
        const navigation = new NavigationService({
            ...buildGrid(id, source),
            asset,
        })
        this.entries.set(id, { source, body, revision, navigation })
    }

    public navigation(locationId: string): NavigationService {
        const entry = this.entries.get(locationId)
        if (entry === undefined) {
            throw new Error(`Unknown world map: ${locationId}`)
        }
        return entry.navigation
    }

    public asset(epoch: string, locationId: string): WorldMapAsset | undefined {
        if (epoch !== this.epoch) {
            return undefined
        }
        const entry = this.entries.get(locationId)
        return entry === undefined
            ? undefined
            : { body: entry.body, revision: entry.revision }
    }

    public adventureData(): Pick<
        AdventureServiceOptions,
        'resourceNodes' | 'worldObjects'
    > {
        const anchors = this.navigation(CENTER_LOCATION_ID).grid.cityAnchors
        const generic = createAdventureResourceNodes().map((node) => {
            const position =
                node.locationId === CENTER_LOCATION_ID
                    ? anchors?.[`resource.${node.kind}`]
                    : undefined
            if (
                node.locationId === CENTER_LOCATION_ID &&
                anchors !== undefined &&
                position === undefined
            ) {
                throw new Error(
                    `Generated city resource anchor is missing: ${node.kind}`
                )
            }
            return position === undefined
                ? node
                : { ...node, position: { ...position } }
        })
        return {
            resourceNodes: [
                ...generic,
                ...[...this.entries].flatMap(([id, entry]) =>
                    readHarvestSources(entry.source, id)
                ),
            ],
            worldObjects: [...this.entries].flatMap(([id, entry]) =>
                readWorldObjects(entry.source, id)
            ),
        }
    }
}

function surfaceMap(
    definition: WorldLocationDefinition,
    options: WorldMapOptions,
    seed: string,
    mapRoot: string,
    dungeonEntrance: DungeonDefinition | undefined
): unknown {
    const { id } = definition
    if (id === CENTER_LOCATION_ID) {
        return generateCity(seed, options.cityStyle, dungeonEntrance)
    }
    if (
        dungeonEntrance !== undefined ||
        (id === WESTERN_RUINS_LOCATION_ID && options.mapRoot === undefined)
    ) {
        return generateWorldMap(definition, {
            ...(id === WESTERN_RUINS_LOCATION_ID
                ? { ashRefugeSeed: seed }
                : {}),
            ...(dungeonEntrance === undefined ? {} : { dungeonEntrance }),
        })
    }
    return JSON.parse(fs.readFileSync(path.join(mapRoot, `${id}.json`), 'utf8'))
}

function readMap(value: unknown): TiledMap {
    if (typeof value !== 'object' || value === null) {
        throw new Error('Invalid world map')
    }
    const map = value as TiledMap
    if (
        ![map.width, map.height, map.tilewidth, map.tileheight].every(
            (number) => Number.isSafeInteger(number) && number > 0
        ) ||
        !Array.isArray(map.layers)
    ) {
        throw new Error('Invalid world map dimensions or layers')
    }
    for (const layer of map.layers) {
        if (
            layer.type === 'tilelayer' &&
            (!Array.isArray(layer.data) ||
                layer.data.length !== map.width * map.height)
        ) {
            throw new Error('Invalid world tile layer')
        }
    }
    return map
}
