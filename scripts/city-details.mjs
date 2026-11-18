import { recordProp } from './generate-depth.mjs'
import { soilGid } from './generate-ground.mjs'

export const stringProperty = (name, value) => ({ name, type: 'string', value })
export function cityAnchor(id, key, x, y) {
    return {
        id,
        name: key,
        type: 'city_anchor',
        point: true,
        x: x * 16 + 8,
        y: y * 16 + 8,
        width: 0,
        height: 0,
        rotation: 0,
        visible: false,
        properties: [stringProperty('anchorId', key)],
    }
}
export function drawChapelTower(ctx, plot) {
    const { structures, solid, at } = ctx
    for (let y = 0; y < 4; y++)
        for (let x = 0; x < 3; x++) {
            structures[at(plot.x + 3 + x, plot.y + y)] =
                512 + (y === 0 ? 96 : y === 3 ? 120 : 108) + x
            solid[at(plot.x + 3 + x, plot.y + y)] = 1
        }
}
export function drawCemetery(ctx, plot, nextId) {
    const { at, terrain, plants, objects, solid, roads } = ctx
    const x = plot.x + 10,
        y = plot.y + 4,
        w = 10,
        h = 11
    for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++) {
            terrain[at(x + dx, y + dy)] = soilGid
            plants[at(x + dx, y + dy)] = 0
        }
    const fence = (dx, dy, tile) => {
        objects[at(x + dx, y + dy)] = tile
        solid[at(x + dx, y + dy)] = 1
    }
    for (let dx = 0; dx < w; dx++) {
        fence(dx, 0, dx === 0 ? 2 : dx === w - 1 ? 4 : 15)
        if (dx !== 2 && dx !== 3)
            fence(dx, h - 1, dx === 0 ? 10 : dx === w - 1 ? 12 : 15)
    }
    for (let dy = 1; dy < h - 1; dy++) {
        fence(0, dy, 5)
        fence(w - 1, dy, 5)
    }
    const anchors = []
    let grave = 1
    for (const dy of [1, 5])
        for (const dx of [1, 4, 7]) {
            objects[at(x + dx, y + dy)] = 204
            solid[at(x + dx, y + dy)] = 1
            recordProp(ctx, x + dx, y + dy, 1, 1, [204], 'grave_decoration')
            ctx.propPlacements.at(-1).semanticId =
                `novogorod:cemetery:headstone-${grave}`
            anchors.push(
                cityAnchor(
                    nextId(),
                    `spawn.grave-${grave++}`,
                    x + dx,
                    y + dy + 1
                )
            )
        }
    for (let dy = 1; dy < h; dy++)
        for (let dx = 1; dx < w - 1; dx++) {
            if (![2, 3].includes(dx) && ![3, 4, 7, 8].includes(dy)) continue
            if (solid[at(x + dx, y + dy)]) continue
            terrain[at(x + dx, y + dy)] = 1024
            roads[at(x + dx, y + dy)] = true
        }
    anchors.push({
        id: nextId(),
        name: 'Кладбище часовни',
        type: 'city_area',
        x: x * 16,
        y: y * 16,
        width: w * 16,
        height: h * 16,
        rotation: 0,
        visible: false,
        properties: [stringProperty('anchorId', 'cemetery')],
    })
    return { anchors, entrance: [x + 2, y + h], bounds: { x, y, w, h } }
}
export function addCityResources(ctx) {
    const { at, objects, solid } = ctx
    function prop(key, x, y, columns, rows, tiles, kind, treeProfile) {
        for (let index = 0; index < tiles.length; index++) {
            const px = x + (index % columns),
                py = y + Math.floor(index / columns)
            objects[at(px, py)] = tiles[index]
            if (kind !== 'tree' || py === y + rows - 1) solid[at(px, py)] = 1
        }
        recordProp(ctx, x, y, columns, rows, tiles, kind, treeProfile)
        ctx.propPlacements.at(-1).semanticId = `novogorod:resource:${key}`
    }
    let index = 1
    for (const [x, y] of [
        [5, 7],
        [6, 21],
        [5, 51],
        [6, 61],
        [89, 7],
        [89, 21],
        [89, 51],
        [89, 61],
    ])
        prop(`tree-${index++}`, x, y, 1, 2, [516, 528], 'tree', 'pine')
    for (const [x, y] of [
        [4, 14],
        [89, 14],
        [4, 54],
        [89, 54],
    ])
        prop(
            `tree-${index++}`,
            x,
            y,
            3,
            4,
            Array.from(
                { length: 12 },
                (_, cell) => 198 + (5 + Math.floor(cell / 3)) * 16 + (cell % 3)
            ),
            'tree',
            'forest'
        )
    index = 1
    for (const [x, y] of [
        [5, 31],
        [5, 47],
        [89, 31],
        [89, 47],
        [20, 73],
        [32, 73],
        [61, 73],
        [75, 73],
    ])
        prop(`bush-${index++}`, x, y, 2, 2, [316, 317, 332, 333], 'plant')
    index = 1
    for (const [x, y] of [
        [20, 6],
        [75, 6],
        [21, 71],
        [75, 71],
    ])
        prop(`stone-${index++}`, x, y, 1, 1, [214], 'stone')
}
