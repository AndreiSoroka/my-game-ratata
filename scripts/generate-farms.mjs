import { FARM_PLOTS } from '../contracts/src/farms.ts'
import { soilGid } from './generate-ground.mjs'
import { addInteriorBuilding } from './generate-interiors.mjs'

const farm = 768
const town = 512

export function addFarmSettlement(ctx, location) {
    const {
        width,
        height,
        at,
        grass,
        terrain,
        plants,
        structures,
        objects,
        solid,
        roads,
        reserved,
    } = ctx
    const plots = FARM_PLOTS.filter((plot) => plot.locationId === location.id)
    if (!plots.length)
        throw new Error(`No shared farm plots for ${location.id}`)
    // A reclaimed clearing west of the encounters, connected to the east-west road.
    for (let y = 43; y <= 53; y += 1)
        for (let x = 19; x <= 38; x += 1) {
            const i = at(x, y)
            grass[i] = 37
            terrain[i] = 0
            plants[i] = 0
            structures[i] = 0
            objects[i] = 0
            solid[i] = 0
            reserved[i] = true
        }
    function path(x, y) {
        const i = at(x, y)
        terrain[i] = town + 25
        plants[i] = 0
        objects[i] = 0
        solid[i] = 0
        reserved[i] = true
        roads[i] = true
    }
    for (let y = 40; y <= 53; y += 1) path(30, y)
    for (let x = 24; x <= 37; x += 1) path(x, 51)
    const covers = Array(width * height).fill(0)
    const barn = addInteriorBuilding(
        { ...ctx, covers },
        {
            id: 100,
            name: 'Фермерский амбар',
            kind: 'farm',
            x: 21,
            y: 44,
            w: 7,
            h: 7,
            occupant: [24, 47],
        }
    )
    // Original green roof and red barn facade from Tiny Farm, above the same walls/floor.
    for (let dy = 0; dy < 7; dy += 1)
        for (let dx = 0; dx < 7; dx += 1) {
            const side = dx === 0 ? 0 : dx === 6 ? 2 : 1
            let tile =
                dy < 4
                    ? dx === 0
                        ? dy === 0
                            ? 93
                            : dy === 3
                              ? 117
                              : 105
                        : dx === 6
                          ? dy === 0
                              ? 95
                              : dy === 3
                                ? 119
                                : 107
                          : dx === 3
                            ? dy === 0
                                ? 94
                                : dy === 3
                                  ? 118
                                  : 106
                            : 107
                    : dy === 4
                      ? 90 + side
                      : dy === 5
                        ? 102 + side
                        : 114 + side
            covers[at(21 + dx, 44 + dy)] = farm + tile
        }
    // An actual open arch remains visible and traversable from outside.
    covers[at(24, 50)] = town + 74
    path(24, 51)
    for (const plot of plots) {
        const x = Math.floor(plot.position.x / 16)
        const y = Math.floor(plot.position.y / 16)
        for (let dx = -1; dx <= 1; dx += 1)
            for (let dy = -1; dy <= 1; dy += 1) {
                const i = at(x + dx, y + dy)
                terrain[i] = soilGid + dx + 1
                plants[i] = 0
                objects[i] = 0
                solid[i] = 0
                reserved[i] = true
            }
        // The active bed center is deliberately bare; crops come from server farm state.
        path(x, y + 2)
        path(x, y + 3)
        path(x, y + 4)
    }
    // Hay, produce crates, a water trough and a few decorative wheat rows.
    for (const [x, y, tile] of [
        [20, 44, 96],
        [20, 45, 97],
        [28, 49, 71],
        [37, 49, 85],
        [28, 52, 110],
        [29, 52, 111],
    ]) {
        objects[at(x, y)] = farm + tile
        solid[at(x, y)] = 1
    }
    for (let x = 21; x <= 27; x += 1) {
        terrain[at(x, 53)] = soilGid + 1
        plants[at(x, 53)] = farm + 66
    }
    for (const x of [20, 21, 22, 26, 27, 31, 32, 34, 35, 37]) {
        objects[at(x, 52)] = town + 81
        solid[at(x, 52)] = 1
    }
    return {
        covers,
        buildings: [barn.object],
        landmarks: [
            {
                id: 1,
                name: 'Пшеничная ферма',
                type: 'landmark',
                point: true,
                x: 30 * 16 + 8,
                y: 42 * 16 + 8,
                width: 0,
                height: 0,
                rotation: 0,
                visible: true,
                properties: [{ name: 'kind', type: 'string', value: 'farm' }],
            },
        ],
        plots: plots.map((plot, index) => ({
            id: 200 + index,
            name: plot.name,
            type: 'farm_plot',
            point: true,
            ...plot.position,
            width: 0,
            height: 0,
            rotation: 0,
            visible: true,
            properties: [
                { name: 'plotId', type: 'string', value: plot.id },
                { name: 'crop', type: 'string', value: plot.crop },
            ],
        })),
    }
}
