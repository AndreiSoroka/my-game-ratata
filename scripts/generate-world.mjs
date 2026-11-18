import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
    CENTER_LOCATION_ID,
    GRID_SIZE,
    WORLD_LOCATION_DEFINITIONS,
} from '../contracts/src/world.ts'
import { generateWorldMap } from './generate-map.mjs'
import { writeGroundTilesets } from './generate-ground.mjs'

// CC0 Kenney Tiny Town and existing Mystic Woods artwork, arranged deterministically. Regenerate with:
// node scripts/generate-world.mjs
// Regenerate one authored location (and its alias): --location map-2-2
const generationArguments = process.argv.slice(2)
const selectedLocation = generationArguments[1]
if (
    generationArguments.length !== 0 &&
    (generationArguments.length !== 2 ||
        generationArguments[0] !== '--location' ||
        !WORLD_LOCATION_DEFINITIONS.some(
            (entry) => entry.id === selectedLocation
        ))
) {
    throw new Error(
        'Usage: generate-world.mjs [--location <world-location-id>]'
    )
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mapRoot = path.join(root, 'apps/frontend/public/game/map')
const width = 96
const height = 80

function tileset(name, image, columns, rows) {
    return {
        columns,
        image,
        imageheight: rows * 16,
        imagewidth: columns * 16,
        margin: 0,
        name,
        spacing: 0,
        tilecount: columns * rows,
        tiledversion: '1.11.2',
        tileheight: 16,
        tilewidth: 16,
        type: 'tileset',
        version: '1.10',
    }
}

for (const [name, image, columns, rows] of [
    ['plains', 'tilesets/plains.png', 6, 12],
    ['water', 'tilesets/water1.png', 6, 4],
    ['walls', 'tilesets/walls/walls.png', 8, 8],
    ['objects', 'objects/objects.png', 16, 13],
]) {
    fs.writeFileSync(
        path.join(mapRoot, `tilesets/MysticWoods/${name}.json`),
        JSON.stringify(
            tileset(name, `../../assets/MysticWoods/${image}`, columns, rows),
            null,
            2
        ) + '\n'
    )
}

fs.writeFileSync(
    path.join(mapRoot, 'tilesets/KenneyTinyTown/town.json'),
    JSON.stringify(
        tileset(
            'Kenney Tiny Town',
            '../../assets/KenneyTinyTown/tilemap_packed.png',
            12,
            11
        ),
        null,
        2
    ) + '\n'
)

fs.mkdirSync(path.join(mapRoot, 'tilesets/KenneyTinyFarm'), { recursive: true })
fs.writeFileSync(
    path.join(mapRoot, 'tilesets/KenneyTinyFarm/farm.json'),
    JSON.stringify(
        tileset(
            'Kenney Tiny Farm',
            '../../assets/KenneyTinyFarm/tilemap_packed.png',
            12,
            11
        ),
        null,
        2
    ) + '\n'
)

writeGroundTilesets(mapRoot)

for (let row = 0; row < GRID_SIZE; row++)
    for (let column = 0; column < GRID_SIZE; column++) {
        const id = WORLD_LOCATION_DEFINITIONS.find(
            (entry) => entry.column === column && entry.row === row
        ).id
        if (selectedLocation && id !== selectedLocation) continue
        const definition = WORLD_LOCATION_DEFINITIONS.find(
            (entry) => entry.id === id
        )
        const map = generateWorldMap(
            definition,
            id === CENTER_LOCATION_ID && process.env.GAME_WORLD_SEED
                ? { seed: process.env.GAME_WORLD_SEED }
                : {}
        )
        const data = JSON.stringify(map) + '\n'
        fs.writeFileSync(path.join(mapRoot, `${id}.json`), data)
        if (id === CENTER_LOCATION_ID)
            fs.writeFileSync(path.join(mapRoot, 'map1.json'), data)
        console.info(`${id}: ${width}×${height} tiles`)
    }
