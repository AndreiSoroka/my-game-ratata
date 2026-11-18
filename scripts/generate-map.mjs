import {
    CENTER_LOCATION_ID,
    GRID_SIZE,
    REGION_NAME,
    WORLD_LOCATION_DEFINITIONS,
} from '../contracts/src/world.ts'
import { addNovogorod } from './generate-city.mjs'
import { addHamlets } from './generate-hamlets.mjs'
import { addFarmSettlement } from './generate-farms.mjs'
import { createSurfaceLayer } from './generate-surfaces.mjs'
import { removePondFragments } from './generate-terrain.mjs'
import {
    connectFences,
    createDepthProps,
    pruneOverwrittenProps,
    recordProp,
} from './generate-depth.mjs'
import { createWorldInteractions } from './generate-interactions.mjs'
import { createHarvestMetadata } from './generate-resources.mjs'
import { createEncounterMetadata } from './generate-encounters.mjs'
import { WORLD_GENERATION_SETTINGS } from './generate-world-settings.mjs'
import {
    doorwayGid,
    pavingGid,
    soilGid,
    woodenFloorGid,
} from './generate-ground.mjs'

const width = 96
const height = 80
const size = width * height
const gid = {
    grass: 37,
    plains: 38,
    water: 110,
    walls: 134,
    objects: 198,
    town: 512,
    farm: 768,
}
function visualBiome(definition) {
    if (definition.biome === 'city')
        return { kind: 'city', trees: 50, lakes: 0, ruins: 0 }
    if (/топи|трясина|пруды/i.test(definition.name))
        return { kind: 'wetland', trees: 120, lakes: 10, ruins: 0 }
    if (/карьер|утёсы|разлом|выси|пустошь|овраг/i.test(definition.name))
        return { kind: 'rocky', trees: 40, lakes: 3, ruins: 2 }
    if (/руины|застава|форт|курганы|изгнанников/i.test(definition.name))
        return { kind: 'ruins', trees: 60, lakes: 3, ruins: 3 }
    if (/сады|поля|хутора|холмы/i.test(definition.name))
        return { kind: 'fields', trees: 75, lakes: 4, ruins: 0 }
    return { kind: 'forest', trees: 175, lakes: 4, ruins: 1 }
}

export function hashSeed(value) {
    let seed = 2166136261
    for (const character of value)
        seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0
    return seed
}

export function generateWorldMap(definition, options = {}) {
    const { column, row } = definition
    const index = row * GRID_SIZE + column
    const { name } = definition
    const biome = visualBiome(definition)
    const treeCount = biome.trees
    const lakeRadius = biome.lakes
    const ruinCount = biome.ruins
    const generationSeed = options.seed ?? 20261106 + index * 1709
    let seed =
        typeof generationSeed === 'number'
            ? generationSeed >>> 0
            : hashSeed(String(generationSeed))
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        return seed / 4294967296
    }
    const propPlacements = []
    const grass = Array(size).fill(gid.grass)
    const terrain = Array(size).fill(0)
    const plants = Array(size).fill(0)
    const structures = Array(size).fill(0)
    const objects = Array(size).fill(0)
    const solid = Array(size).fill(0)
    const roads = Array(size).fill(false)
    const water = Array(size).fill(false)
    const reserved = Array(size).fill(false)
    const keyPoints = [
        [48, 40],
        [50, 43],
        [42, 45],
        [60, 36],
        [55, 50],
        [70, 48],
        [28, 28],
        [28, 60],
        [20, 20],
        [74, 20],
        [20, 60],
        [74, 60],
    ]
    const at = (x, y) => y * width + x
    const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height
    const reserve = (x, y) => {
        if (inside(x, y)) reserved[at(x, y)] = true
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (x < 4 || y < 4 || x >= width - 4 || y >= height - 4)
                reserve(x, y)
            if (keyPoints.some(([px, py]) => Math.hypot(x - px, y - py) <= 6))
                reserve(x, y)
        }
    }
    function road(points, radius = 1) {
        for (let segment = 1; segment < points.length; segment++) {
            const [ax, ay] = points[segment - 1]
            const [bx, by] = points[segment]
            const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay))
            for (let t = 0; t <= steps; t++) {
                const x = Math.round(ax + ((bx - ax) * t) / Math.max(1, steps))
                const y = Math.round(ay + ((by - ay) * t) / Math.max(1, steps))
                for (let dy = -radius - 1; dy <= radius + 1; dy++) {
                    for (let dx = -radius - 1; dx <= radius + 1; dx++) {
                        reserve(x + dx, y + dy)
                        if (
                            inside(x + dx, y + dy) &&
                            Math.abs(dx) <= radius &&
                            Math.abs(dy) <= radius
                        )
                            roads[at(x + dx, y + dy)] = true
                    }
                }
            }
        }
    }
    road([
        [0, 40],
        [95, 40],
    ])
    road([
        [48, 0],
        [48, 79],
    ])
    road([
        [48, 40],
        [32, 40],
        [32, 28],
        [20, 28],
        [20, 20],
    ])
    road([
        [48, 40],
        [62, 40],
        [62, 24],
        [74, 24],
        [74, 20],
    ])
    road([
        [48, 40],
        [34, 40],
        [34, 55],
        [20, 55],
        [20, 60],
    ])
    road([
        [48, 40],
        [62, 40],
        [62, 56],
        [74, 56],
        [74, 60],
    ])
    road(
        [
            [48, 43],
            [42, 45],
        ],
        1
    )
    for (const [x, y] of [
        [60, 36],
        [55, 50],
        [70, 48],
        [28, 28],
        [28, 60],
    ])
        road([
            [48, 40],
            [x, 40],
            [x, y],
        ])
    // A small campsite plaza is kept clear for simultaneous joins and combat.
    for (let y = 37; y <= 45; y++)
        for (let x = 43; x <= 56; x++) roads[at(x, y)] = true
    for (const [cx, cy, stretch] of [
        [24, 43, 1.4],
        [73, 11, 1],
        [14, 68, 0.8],
    ]) {
        for (let y = 4; y < height - 4; y++) {
            for (let x = 4; x < width - 4; x++) {
                if (
                    !reserved[at(x, y)] &&
                    ((x - cx) / (lakeRadius * stretch)) ** 2 +
                        ((y - cy) / lakeRadius) ** 2 <
                        1
                ) {
                    water[at(x, y)] = true
                    solid[at(x, y)] = 1
                }
            }
        }
    }
    function edgeTile(mask, x, y, firstgid) {
        const has = (px, py) => inside(px, py) && mask[at(px, py)]
        const tx = !has(x - 1, y) ? 1 : !has(x + 1, y) ? 3 : 2
        const ty = !has(x, y - 1) ? 0 : !has(x, y + 1) ? 2 : 1
        return firstgid + ty * 6 + tx
    }
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            if (roads[at(x, y)])
                terrain[at(x, y)] = edgeTile(roads, x, y, gid.plains)
            if (water[at(x, y)])
                terrain[at(x, y)] = edgeTile(water, x, y, gid.water)
        }
    function sprite(x, y, sx, sy, w, h, blocks = true, kind) {
        if (x < 4 || y < 4 || x + w >= width - 4 || y + h >= height - 4)
            return false
        for (let dy = 0; dy < h; dy++)
            for (let dx = 0; dx < w; dx++) {
                const i = at(x + dx, y + dy)
                if (
                    reserved[i] ||
                    roads[i] ||
                    solid[i] ||
                    objects[i] ||
                    structures[i]
                )
                    return false
            }
        for (let dy = 0; dy < h; dy++)
            for (let dx = 0; dx < w; dx++) {
                const i = at(x + dx, y + dy)
                objects[i] = gid.objects + (sy + dy) * 16 + sx + dx
                if (blocks && dy >= Math.max(0, h - 2)) solid[i] = 1
            }
        recordProp(
            { propPlacements },
            x,
            y,
            w,
            h,
            Array.from(
                { length: w * h },
                (_, i) =>
                    gid.objects + (sy + Math.floor(i / w)) * 16 + sx + (i % w)
            ),
            kind ?? (w === 3 && h === 4 ? 'tree' : 'plant'),
            w === 3 && h === 4 ? (sx === 3 ? 'apple' : 'forest') : undefined
        )
        return true
    }
    // Ruins have two broad entrances; rooms are never sealed.
    for (const [cx, cy] of [
        [74, 20],
        [20, 60],
        [74, 60],
    ].slice(0, ruinCount)) {
        for (let y = cy - 7; y <= cy + 7; y++)
            for (let x = cx - 9; x <= cx + 9; x++) {
                const wall =
                    x === cx - 9 || x === cx + 9 || y === cy - 7 || y === cy + 7
                const gate = Math.abs(x - cx) <= 2 || Math.abs(y - cy) <= 2
                if (wall && !gate && !reserved[at(x, y)] && !water[at(x, y)]) {
                    structures[at(x, y)] =
                        gid.walls + (y === cy - 7 ? 2 : 4 * 8 + 2)
                    solid[at(x, y)] = 1
                }
                if (
                    !wall &&
                    !water[at(x, y)] &&
                    !roads[at(x, y)] &&
                    random() < 0.25
                ) {
                    plants[at(x, y)] = gid.plains + 9 * 6 + 2
                }
            }
    }
    if (definition.biome === 'outskirts')
        addHamlets({
            width,
            height,
            at,
            terrain,
            plants,
            structures,
            objects,
            solid,
            reserved,
            roads,
            random,
        })
    for (
        let n = 0, attempts = 0;
        n < treeCount && attempts < treeCount * 12;
        attempts++
    ) {
        const x = 5 + Math.floor(random() * (width - 12))
        const y = 5 + Math.floor(random() * (height - 13))
        if (
            sprite(
                x,
                y,
                biome.kind === 'fields' || random() < 0.3 ? 3 : 0,
                random() < 0.5 ? 5 : 9,
                3,
                4
            )
        )
            n++
    }
    for (let n = 0; n < 180; n++) {
        const x = 5 + Math.floor(random() * (width - 11))
        const y = 5 + Math.floor(random() * (height - 11))
        if (biome.kind === 'rocky' || biome.kind === 'ruins')
            sprite(x, y, Math.floor(random() * 3), 1, 1, 1, true, 'stone')
        else sprite(x, y, 6, 7, 2, 2)
    }
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = at(x, y)
            if (
                !terrain[i] &&
                !solid[i] &&
                !objects[i] &&
                random() < (biome.kind === 'fields' ? 0.17 : 0.055)
            ) {
                plants[i] = [17, 18, 19, 25, 26, 27, 28, 34][
                    Math.floor(random() * 8)
                ]
            }
        }
    // Signposts orient explorers at the main junction and the four approaches.
    for (const [x, y] of [
        [45, 36],
        [5, 37],
        [90, 37],
        [45, 5],
        [45, 74],
    ]) {
        objects[at(x, y)] = gid.objects
    }
    // Existing room layout remains a useful destination in the starting camp.
    objects[at(40, 43)] = gid.objects + 16 + 3
    objects[at(41, 43)] = gid.objects + 16 + 4
    objects[at(40, 46)] = gid.objects + 3
    objects[at(44, 36)] = gid.objects + 3
    objects[at(55, 36)] = gid.objects + 4
    objects[at(55, 35)] = gid.objects + 6
    const settlementContext = {
        settings: WORLD_GENERATION_SETTINGS,
        generationSeed,
        cityStyle: options.style,
        forceCityFallback: options.forceCityFallback,
        propPlacements,
        width,
        height,
        grass,
        terrain,
        plants,
        structures,
        objects,
        solid,
        at,
        random,
        keyPoints,
        reserved,
        roads,
    }
    const settlement =
        definition.biome === 'city'
            ? { ...addNovogorod(settlementContext, definition), plots: [] }
            : definition.biome === 'outskirts'
              ? addFarmSettlement(settlementContext, definition)
              : { landmarks: [], buildings: [], covers: [], plots: [] }
    const {
        landmarks,
        buildings,
        covers,
        plots,
        training = [],
        anchors = [],
        fortifications = [],
        interactions: cityInteractions = [],
    } = settlement
    // The transition system permits travel anywhere along an edge, not only at gates.
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            if (x < 4 || y < 4 || x >= width - 4 || y >= height - 4) {
                const i = at(x, y)
                solid[i] = 0
                objects[i] = 0
                structures[i] = 0
            }
        }
    removePondFragments(settlementContext)
    pruneOverwrittenProps(settlementContext)
    connectFences(settlementContext)
    const interactions = createWorldInteractions(
        settlementContext,
        definition,
        landmarks
    )
    interactions.push(...cityInteractions)
    const depthProps = createDepthProps(settlementContext, definition.id)
    const layer = (id, layerName, data, visible = true, collision = false) => ({
        data,
        height,
        id,
        name: layerName,
        opacity: 1,
        properties: collision
            ? [{ name: 'solid', type: 'bool', value: true }]
            : [],
        type: 'tilelayer',
        visible,
        width,
        x: 0,
        y: 0,
    })
    return {
        compressionlevel: -1,
        height,
        infinite: false,
        layers: [
            layer(1, 'Grass', grass),
            layer(2, 'Paths and ponds', terrain),
            layer(3, 'Flowers and rubble', plants),
            layer(4, 'Ruins', structures),
            layer(5, 'Trees and landmarks', objects),
            layer(6, 'Collision', solid, false, true),
            ...createHarvestMetadata(
                settlementContext,
                definition.id,
                depthProps,
                buildings
            ),
            ...createEncounterMetadata(
                settlementContext,
                definition,
                depthProps
            ),
            ...(training.length
                ? [
                      {
                          id: 19,
                          name: 'Training grounds',
                          type: 'objectgroup',
                          visible: true,
                          opacity: 1,
                          draworder: 'topdown',
                          objects: training,
                      },
                  ]
                : []),
            ...(anchors.length
                ? [
                      {
                          id: 20,
                          name: 'City anchors',
                          type: 'objectgroup',
                          visible: true,
                          opacity: 1,
                          draworder: 'topdown',
                          objects: anchors,
                      },
                  ]
                : []),
            ...(fortifications.length
                ? [
                      {
                          id: 21,
                          name: 'Fortifications',
                          type: 'objectgroup',
                          visible: false,
                          opacity: 1,
                          draworder: 'topdown',
                          objects: fortifications,
                      },
                  ]
                : []),
            {
                id: 12,
                name: 'Depth props',
                type: 'objectgroup',
                visible: true,
                opacity: 1,
                draworder: 'topdown',
                objects: depthProps,
            },
            {
                id: 13,
                name: 'World interactions',
                type: 'objectgroup',
                visible: true,
                opacity: 1,
                draworder: 'topdown',
                objects: interactions,
            },
            {
                ...createSurfaceLayer({
                    width,
                    height,
                    grass,
                    terrain,
                    buildings,
                }),
                id: 11,
            },
            ...(plots.length
                ? [
                      {
                          id: 10,
                          name: 'Farm plots',
                          type: 'objectgroup',
                          visible: true,
                          opacity: 1,
                          draworder: 'topdown',
                          objects: plots,
                      },
                  ]
                : []),
            ...(buildings.length
                ? [
                      layer(7, 'Building covers', covers),
                      {
                          id: 8,
                          name: 'Buildings',
                          type: 'objectgroup',
                          visible: true,
                          opacity: 1,
                          draworder: 'topdown',
                          objects: buildings,
                      },
                  ]
                : []),
            ...(landmarks.length === 0
                ? []
                : [
                      {
                          id: 9,
                          name: 'City landmarks',
                          type: 'objectgroup',
                          visible: true,
                          opacity: 1,
                          draworder: 'topdown',
                          objects: landmarks,
                      },
                  ]),
        ],
        nextlayerid: anchors.length ? 22 : training.length ? 20 : 19,
        nextobjectid: anchors.length ? 70000 : training.length ? 40002 : 40000,
        orientation: 'orthogonal',
        properties: [
            { name: 'locationName', type: 'string', value: name },
            { name: 'locationId', type: 'string', value: definition.id },
            { name: 'regionName', type: 'string', value: REGION_NAME },
            { name: 'dangerLevel', type: 'int', value: definition.dangerLevel },
            { name: 'biome', type: 'string', value: biome.kind },
            {
                name: 'generationSeed',
                type: typeof generationSeed === 'number' ? 'int' : 'string',
                value: generationSeed,
            },
            {
                name: 'generationVersion',
                type: 'int',
                value:
                    definition.biome === 'city' ? 9 : training.length ? 8 : 7,
            },
            ...(settlement.generationProperties ?? []).filter(
                (property) => property.name !== 'generationVersion'
            ),
            ...(settlement.generationProperties
                ? [
                      {
                          name: 'cityLayoutFallback',
                          type: 'bool',
                          value: settlementContext.cityPlan.fallback,
                      },
                      {
                          name: 'cityLayoutAttempts',
                          type: 'int',
                          value: settlementContext.cityPlan.attempts,
                      },
                  ]
                : []),
            { name: 'worldColumn', type: 'int', value: column },
            { name: 'worldRow', type: 'int', value: row },
        ],
        renderorder: 'right-down',
        tiledversion: '1.11.2',
        tileheight: 16,
        tilesets: [
            { firstgid: 1, source: 'tilesets/MysticWoods/fences.json' },
            { firstgid: 17, source: 'tilesets/MysticWoods/decor.json' },
            { firstgid: gid.grass, source: 'tilesets/MysticWoods/grass.json' },
            ...['plains', 'water', 'walls', 'objects'].map((name) => ({
                firstgid: gid[name],
                source: `tilesets/MysticWoods/${name}.json`,
            })),
            { firstgid: gid.town, source: 'tilesets/KenneyTinyTown/town.json' },
            { firstgid: gid.farm, source: 'tilesets/KenneyTinyFarm/farm.json' },
            { firstgid: pavingGid, source: 'tilesets/Novogorod/paving.json' },
            {
                firstgid: woodenFloorGid,
                source: 'tilesets/Novogorod/wooden.json',
            },
            { firstgid: soilGid, source: 'tilesets/Novogorod/soil.json' },
            { firstgid: doorwayGid, source: 'tilesets/Novogorod/doorway.json' },
        ],
        tilewidth: 16,
        type: 'map',
        version: '1.10',
        width,
    }
}

/** Pure complete map: no filesystem access, model calls or wall-clock input. */
export function generateCity(seed, style) {
    if (
        (typeof seed !== 'string' && typeof seed !== 'number') ||
        (typeof seed === 'number' && !Number.isFinite(seed)) ||
        String(seed).trim().length === 0
    )
        throw new Error('City generation requires a seed')
    const definition = WORLD_LOCATION_DEFINITIONS.find(
        (entry) => entry.id === CENTER_LOCATION_ID
    )
    return generateWorldMap(definition, { seed, style })
}
