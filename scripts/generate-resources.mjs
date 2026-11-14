/** Semantic harvesting/planting metadata; runtime rules never inspect atlas GIDs. */
export function createHarvestMetadata(ctx, locationId, props, buildings) {
    const { width, height, at, solid, roads, reserved } = ctx
    const owned = Array(width * height).fill(0)
    const sources = []
    for (const prop of props) {
        if (prop.name !== 'tree' && prop.name !== 'stone') continue
        const tree = prop.name === 'tree'
        const rows = tree ? (prop.width === 16 ? 1 : 2) : 1
        const bounds = {
            x: prop.x,
            y: prop.y + prop.height - rows * 16,
            width: prop.width,
            height: rows * 16,
        }
        for (let y = bounds.y / 16; y < (bounds.y + bounds.height) / 16; y++)
            for (let x = bounds.x / 16; x < (bounds.x + bounds.width) / 16; x++)
                if (solid[at(x, y)]) owned[at(x, y)] = 1
        const propId = prop.properties.find((p) => p.name === 'propId').value
        const treeProfile = prop.properties.find(
            (p) => p.name === 'treeProfile'
        )?.value
        if (tree && !['forest', 'apple', 'pine'].includes(treeProfile))
            throw new Error(`Missing tree profile: ${propId}`)
        sources.push({
            id: 20000 + sources.length,
            name: tree ? 'Дерево' : 'Камень',
            type: tree ? 'tree' : 'stone',
            ...bounds,
            rotation: 0,
            visible: true,
            properties: [
                {
                    name: 'sourceId',
                    type: 'string',
                    value: `${locationId}:harvest:${propId}`,
                },
                { name: 'propId', type: 'string', value: propId },
                ...(tree
                    ? [
                          {
                              name: 'treeProfile',
                              type: 'string',
                              value: treeProfile,
                          },
                      ]
                    : []),
                {
                    name: 'visual',
                    type: 'string',
                    value: prop.width === 16 && tree ? 'pine' : 'forest',
                },
                { name: 'capacity', type: 'int', value: 8 },
            ],
        })
    }
    const plantable = solid.map((blocked, index) =>
        (!blocked || owned[index]) && !roads[index] && !reserved[index] ? 1 : 0
    )
    const protect = (bounds) => {
        for (
            let y = Math.floor(bounds.y / 16);
            y < Math.ceil((bounds.y + bounds.height) / 16);
            y++
        )
            for (
                let x = Math.floor(bounds.x / 16);
                x < Math.ceil((bounds.x + bounds.width) / 16);
                x++
            )
                if (x >= 0 && y >= 0 && x < width && y < height)
                    plantable[at(x, y)] = 0
    }
    for (const prop of props) {
        if (prop.name !== 'tree' && prop.name !== 'stone') protect(prop)
    }
    for (const building of buildings)
        protect({
            x: building.x - 16,
            y: building.y - 16,
            width: building.width + 32,
            height: building.height + 32,
        })
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
            if (x < 4 || y < 4 || x >= width - 4 || y >= height - 4)
                plantable[at(x, y)] = 0
    const layer = (name, data) => ({
        name,
        type: 'tilelayer',
        width,
        height,
        visible: false,
        opacity: 1,
        x: 0,
        y: 0,
        data,
    })
    return [
        {
            id: 14,
            name: 'Harvest sources',
            type: 'objectgroup',
            visible: true,
            opacity: 1,
            draworder: 'topdown',
            objects: sources,
        },
        { id: 15, ...layer('Resource collision', owned) },
        { id: 16, ...layer('Plantable ground', plantable) },
    ]
}
