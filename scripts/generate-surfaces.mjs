const surfaceGids = { grass: 37, stone: 94, dirt: 537, wood: 585 }

// Invisible but valid Tiled GIDs, with a local legend for the audio presentation.
export function createSurfaceLayer({
    width,
    height,
    grass,
    terrain,
    buildings = [],
}) {
    const data = grass.map((_, index) => {
        const gid = terrain[index] ?? 0
        if (gid === 94 || gid === 1024) return surfaceGids.stone
        if (gid === 1025) return surfaceGids.wood
        if (gid === 0 || gid === 512 || gid === 513) return surfaceGids.grass
        return surfaceGids.dirt
    })
    for (const building of buildings) {
        const kind = building.properties.find(
            (property) => property.name === 'kind'
        )?.value
        const surface = ['guild', 'chapel', 'library', 'smithy'].includes(kind)
            ? 'stone'
            : 'wood'
        for (
            let y = building.y / 16;
            y < (building.y + building.height) / 16;
            y += 1
        ) {
            for (
                let x = building.x / 16;
                x < (building.x + building.width) / 16;
                x += 1
            ) {
                data[y * width + x] = surfaceGids[surface]
            }
        }
    }
    return {
        name: 'Footstep surfaces',
        type: 'tilelayer',
        width,
        height,
        visible: false,
        opacity: 1,
        x: 0,
        y: 0,
        data,
        properties: Object.entries(surfaceGids).map(([surface, gid]) => ({
            name: `surface.${gid}`,
            type: 'string',
            value: surface,
        })),
    }
}
