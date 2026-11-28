import { recordProp } from './generate-depth.mjs'
import { doorwayGid, pavingGid, woodenFloorGid } from './generate-ground.mjs'

const town = 512
const furnishings = 198

export function doorInteraction(
    id,
    locationId,
    key,
    name,
    [x, y],
    state,
    appearance
) {
    return {
        id,
        name,
        type: 'door',
        x: x * 16,
        y: y * 16,
        width: 16,
        height: 16,
        rotation: 0,
        visible: true,
        properties: [
            {
                name: 'interactionId',
                type: 'string',
                value: `${locationId}:door:${key}`,
            },
            { name: 'doorState', type: 'string', value: state },
            ...(appearance === undefined
                ? []
                : [
                      {
                          name: 'doorAppearance',
                          type: 'string',
                          value: appearance,
                      },
                  ]),
        ],
    }
}

// A building is ordinary map geometry. Its roof/facade is a removable visual cover.
export function addInteriorBuilding(ctx, definition) {
    const { at, terrain, plants, structures, objects, solid, covers } = ctx
    const {
        id,
        name,
        kind,
        x,
        y,
        w,
        h,
        red = false,
        stone = false,
        occupant,
    } = definition
    const roof = red ? 52 : 48
    const wall = stone ? 76 : 72
    const roofRows = Math.max(3, Math.floor(h * 0.55))
    const door = Math.floor(w / 2)
    const doorTile = stone ? 78 : 74
    for (let dy = 0; dy < h; dy += 1)
        for (let dx = 0; dx < w; dx += 1) {
            const i = at(x + dx, y + dy)
            const side = dx === 0 ? 0 : dx === w - 1 ? 2 : 1
            const perimeter =
                dx === 0 || dx === w - 1 || dy === 0 || dy === h - 1
            const entry = dy === h - 1 && dx === door
            let tile =
                dy < roofRows
                    ? roof + (dy === 0 ? 0 : 12) + side
                    : wall + (side === 2 ? 3 : side)
            if (dy === roofRows - 1 && dx === door) tile = red ? 67 : 63
            if (dy === h - 2 && dx > 0 && dx < w - 1 && dx % 3 === 1)
                tile = stone ? 88 : 84
            if (entry) tile = doorTile
            covers[i] = town + tile
            terrain[i] = entry ? doorwayGid : stone ? pavingGid : woodenFloorGid
            structures[i] = perimeter
                ? town + (entry ? doorTile : wall + (side === 2 ? 3 : side))
                : 0
            plants[i] = 0
            objects[i] = 0
            solid[i] = perimeter && !entry ? 1 : 0
        }
    const protectedTiles = [occupant, ...(definition.extraOccupants ?? [])]
    function furniture(
        dx,
        dy,
        columns,
        rows,
        tiles,
        speechTransparent = false
    ) {
        for (let row = 0; row < rows; row += 1)
            for (let column = 0; column < columns; column += 1) {
                const px = x + dx + column,
                    py = y + dy + row
                if (
                    dx + column === door ||
                    dx + column < 1 ||
                    dx + column >= w - 1 ||
                    dy + row < 1 ||
                    dy + row >= h - 1 ||
                    protectedTiles.some(([tx, ty]) => tx === px && ty === py) ||
                    objects[at(px, py)]
                )
                    return false
            }
        const gids = tiles.map((tile) => furnishings + tile)
        for (let row = 0; row < rows; row += 1)
            for (let column = 0; column < columns; column += 1) {
                const i = at(x + dx + column, y + dy + row)
                objects[i] = gids[row * columns + column]
                solid[i] = 1
            }
        recordProp(
            ctx,
            x + dx,
            y + dy,
            columns,
            rows,
            gids,
            'furniture',
            undefined,
            speechTransparent
        )
        return true
    }
    // Stamp complete assets atomically. A narrow room gets the complete two-tile
    // bench rather than a three-tile table with its central segment cut away.
    furniture(1, 1, 1, 2, [44, 60])
    if (!furniture(1, 3, 3, 1, [9, 10, 11], true))
        furniture(1, 3, 2, 1, [19, 20], true)
    if (['inn', 'home'].includes(kind)) {
        furniture(w - 2, 1, 1, 2, [43, 59])
    } else if (kind === 'library') {
        furniture(w - 2, 1, 1, 2, [44, 60])
    } else {
        furniture(w - 2, 1, 1, 1, [kind === 'chapel' ? 6 : 2])
        furniture(w - 2, 2, 1, 1, [3])
    }
    furniture(w - 2, h - 3, 1, 1, [kind === 'smithy' ? 4 : 42])
    return {
        object: {
            id,
            name,
            type: 'building',
            x: x * 16,
            y: y * 16,
            width: w * 16,
            height: h * 16,
            rotation: 0,
            visible: true,
            properties: [
                { name: 'kind', type: 'string', value: kind },
                { name: 'entryX', type: 'float', value: (x + door) * 16 + 8 },
                { name: 'entryY', type: 'float', value: (y + h - 1) * 16 + 8 },
                {
                    name: 'interiorX',
                    type: 'float',
                    value: occupant[0] * 16 + 8,
                },
                {
                    name: 'interiorY',
                    type: 'float',
                    value: occupant[1] * 16 + 8,
                },
            ],
        },
        threshold: [x + door, y + h - 1],
        front: [x + door, y + h],
        destinations: [[x + door, y + h - 1], ...protectedTiles],
    }
}
