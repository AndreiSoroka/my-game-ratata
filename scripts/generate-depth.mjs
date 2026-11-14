export function recordProp(
    ctx,
    x,
    y,
    columns,
    rows,
    tiles,
    kind = 'prop',
    treeProfile
) {
    ctx.propPlacements.push({
        x,
        y,
        columns,
        rows,
        tiles: [...tiles],
        kind,
        treeProfile,
    })
}

// Settlements replace ground after forest generation. Remove an intersected sprite
// as one object instead of leaving half a canopy/trunk at the clearing boundary.
export function pruneOverwrittenProps(ctx) {
    const { at, objects, structures, solid, propPlacements } = ctx
    for (const prop of propPlacements) {
        const indices = prop.tiles.map((_, index) =>
            at(
                prop.x + (index % prop.columns),
                prop.y + Math.floor(index / prop.columns)
            )
        )
        prop.valid = indices.every(
            (cell, index) => objects[cell] === prop.tiles[index]
        )
        if (prop.valid) continue
        for (let index = 0; index < indices.length; index += 1) {
            const cell = indices[index]
            if (objects[cell] !== prop.tiles[index]) continue
            objects[cell] = 0
            if (!structures[cell]) solid[cell] = 0
        }
    }
}

export function createDepthProps(ctx, locationId) {
    const { width, height, at, objects, propPlacements } = ctx
    const result = []
    function take(prop) {
        const id = 10000 + result.length
        result.push({
            id,
            name: prop.kind,
            type: 'depth_prop',
            x: prop.x * 16,
            y: prop.y * 16,
            width: prop.columns * 16,
            height: prop.rows * 16,
            rotation: 0,
            visible: true,
            properties: [
                ...(prop.treeProfile
                    ? [
                          {
                              name: 'treeProfile',
                              type: 'string',
                              value: prop.treeProfile,
                          },
                      ]
                    : []),
                {
                    name: 'propId',
                    type: 'string',
                    value: `${locationId}:prop:${prop.x}:${prop.y}`,
                },
                {
                    name: 'baseY',
                    type: 'float',
                    value: (prop.y + prop.rows) * 16 - 2,
                },
                { name: 'columns', type: 'int', value: prop.columns },
                {
                    name: 'tiles',
                    type: 'string',
                    value: JSON.stringify(prop.tiles),
                },
            ],
        })
        for (let dy = 0; dy < prop.rows; dy += 1)
            for (let dx = 0; dx < prop.columns; dx += 1)
                objects[at(prop.x + dx, prop.y + dy)] = 0
    }
    for (const prop of propPlacements) {
        if (
            prop.valid &&
            prop.tiles.every(
                (tile, index) =>
                    objects[
                        at(
                            prop.x + (index % prop.columns),
                            prop.y + Math.floor(index / prop.columns)
                        )
                    ] === tile
            )
        )
            take(prop)
    }
    // Authored one/two-tile props use the same depth renderer as forest sprites.
    for (let y = 0; y < height; y += 1)
        for (let x = 0; x < width; x += 1) {
            const tile = objects[at(x, y)]
            if (!tile) continue
            const next = objects[at(x + 1, y)]
            const pair =
                x + 1 < width &&
                ((tile === 198 + 19 && next === 198 + 20) ||
                    (tile === 768 + 110 && next === 768 + 111))
            take({
                x,
                y,
                columns: pair ? 2 : 1,
                rows: 1,
                tiles: pair ? [tile, next] : [tile],
                kind: pair ? 'complete prop' : 'prop',
            })
        }
    return result
}

export function connectFences(ctx) {
    const { width, height, at, objects } = ctx
    const fence = (tile) => tile >= 512 + 80 && tile <= 512 + 82
    for (let y = 0; y < height; y += 1)
        for (let x = 0; x < width; x += 1) {
            if (!fence(objects[at(x, y)])) continue
            let end = x
            while (end + 1 < width && fence(objects[at(end + 1, y)])) end += 1
            for (let px = x; px <= end; px += 1)
                objects[at(px, y)] =
                    x === end
                        ? 9
                        : px === x
                          ? 14
                          : px === end
                            ? 16
                            : (px - x) % 2
                              ? 15
                              : 3
            x = end
        }
}
