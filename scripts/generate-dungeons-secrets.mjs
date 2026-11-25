// Leave the same uncarved space on every floor, whether it contains a secret or not.
export const secretReserveRows = 28

const roomSpacing = 8
const tileSize = 16
const tileCenter = (tile) => (tile + 0.5) * tileSize
const cardinal = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
]

/** Generate private one-way reveal stages without changing the public floor. */
export function createSecretLayerObjects(options) {
    const {
        id,
        grid,
        floor,
        walls,
        surfaces,
        stoneSurface,
        roll,
        point,
        prop,
    } = options
    if (roll(100) >= 30) return []

    const roomCount = 1 + roll(3)
    const split = roomCount > 1 && roll(100) < 30 ? 1 + roll(roomCount - 1) : 0
    const roomSizes = Array.from({ length: roomCount }, () => ({
        width: 5 + 2 * roll(2),
        height: 4 + roll(3),
    }))
    const secret = placeSecret(grid, walls, roomSizes, split, roll)
    const base = { solid: grid.solid, floor, walls, surfaces }
    const newFloors = secret.opened.map((blocked, index) =>
        grid.solid[index] && !blocked
            ? options.floorGid(roll(options.floorVariantCount))
            : floor[index]
    )
    const unchangedWalls = options.wallGids(grid)
    const stageTiles = (solid) => {
        const naturalWalls = options.wallGids({ ...grid, solid })
        return {
            solid,
            floor: newFloors.map((gid, index) => (solid[index] ? 0 : gid)),
            walls: naturalWalls.map((gid, index) =>
                gid === unchangedWalls[index] ? walls[index] : gid
            ),
            surfaces: solid.map((blocked) => (blocked ? 0 : stoneSurface)),
        }
    }
    const opened = stageTiles(secret.opened)
    const primaryId = `${id}:secret`
    const reward = secretReward(secret.rooms.at(-1), roll)
    const object = (index, entry, properties) =>
        point(
            100 + index,
            'Тайная стена',
            'dungeon_secret',
            tileCenter(entry.x),
            tileCenter(entry.y),
            properties
        )
    if (secret.nested === undefined) {
        return [
            object(
                0,
                secret.entry,
                stageProperties(
                    primaryId,
                    roomCount,
                    tilePatch(base, opened),
                    prop,
                    reward
                )
            ),
        ]
    }
    const prefix = stageTiles(secret.nested.prefix)
    return [
        object(
            0,
            secret.entry,
            stageProperties(primaryId, split, tilePatch(base, prefix), prop)
        ),
        object(1, secret.nested.entry, [
            ...stageProperties(
                `${id}:secret-nested`,
                roomCount - split,
                tilePatch(prefix, opened),
                prop,
                reward
            ),
            prop('requires', 'string', JSON.stringify(primaryId)),
        ]),
    ]
}

function stageProperties(id, roomCount, patch, prop, reward) {
    return [
        prop('id', 'string', id),
        prop('roomCount', 'int', roomCount),
        prop('tiles', 'string', JSON.stringify(patch)),
        ...(reward === undefined
            ? []
            : [
                  prop('chest', 'string', JSON.stringify(reward.chest)),
                  prop('guards', 'string', JSON.stringify(reward.guards)),
              ]),
    ]
}

function placeSecret(grid, walls, roomSizes, split, roll) {
    const candidates = exposedWallSites(grid, walls)
    while (candidates.length > 0) {
        const [entry] = candidates.splice(roll(candidates.length), 1)
        const rooms = roomSizes.map(({ width, height }, index) => ({
            x: entry.x - Math.floor(width / 2),
            y: secretReserveRows - 1 - roomSpacing * index - height,
            width,
            height,
        }))
        const opened = carveSecret(grid, entry, rooms)
        if (!hasOneSeam(grid, grid.solid, opened, entry)) continue
        if (split === 0) return { entry, rooms, opened }
        const prefixRooms = rooms.slice(0, split)
        const prefix = carveSecret(grid, entry, prefixRooms)
        const nestedEntry = { x: entry.x, y: prefixRooms.at(-1).y - 1 }
        if (
            hasOneSeam(grid, grid.solid, prefix, entry) &&
            hasOneSeam(grid, prefix, opened, nestedEntry)
        )
            return {
                entry,
                rooms,
                opened,
                nested: { entry: nestedEntry, prefix },
            }
    }
    throw new Error('Dungeon secret strip has no isolated wall connection')
}

function exposedWallSites({ width, height, at, solid }, walls) {
    const results = []
    // The first floor cell in a column leaves room for a northward secret corridor.
    for (let x = 4; x < width - 4; x++) {
        for (let y = secretReserveRows; y < height - 2; y++) {
            if (solid[at(x, y + 1)]) continue
            if (walls[at(x, y)] !== 0) results.push({ x, y })
            break
        }
    }
    return results
}

function carveSecret({ at, solid }, entry, rooms) {
    const result = solid.slice()
    for (let y = entry.y; y >= rooms.at(-1).y; y--) result[at(entry.x, y)] = 0
    for (const room of rooms) {
        for (let y = room.y; y < room.y + room.height; y++) {
            for (let x = room.x; x < room.x + room.width; x++)
                result[at(x, y)] = 0
        }
    }
    return result
}

/** Only the entrance can touch the previously open floor. */
function hasOneSeam({ at, width }, before, after, entry) {
    const entrance = at(entry.x, entry.y)
    const approach = at(entry.x, entry.y + 1)
    return (
        before[entrance] === 1 &&
        after[entrance] === 0 &&
        before[approach] === 0 &&
        after.every((blocked, index) => {
            if (blocked || !before[index]) return true
            const x = index % width
            const y = Math.floor(index / width)
            return cardinal.every(([dx, dy]) => {
                const neighbor = at(x + dx, y + dy)
                return (
                    before[neighbor] !== 0 ||
                    (index === entrance && neighbor === approach)
                )
            })
        })
    )
}

function tilePatch(before, after) {
    return after.solid.flatMap((solid, index) => {
        const floorGid = after.floor[index]
        const wallGid = after.walls[index]
        const surfaceGid = after.surfaces[index]
        return solid === before.solid[index] &&
            floorGid === before.floor[index] &&
            wallGid === before.walls[index] &&
            surfaceGid === before.surfaces[index]
            ? []
            : [{ index, solid: solid !== 0, floorGid, wallGid, surfaceGid }]
    })
}

function secretReward(room, roll) {
    const x = room.x + Math.floor(room.width / 2)
    const extra = ['lantern', 'boots', 'scrap', 'simple_sword']
    return {
        chest: {
            x: tileCenter(x),
            y: tileCenter(room.y + 1),
            items: ['food', 'torch', extra[roll(extra.length)]].map(
                (itemId) => ({
                    itemId,
                    quantity: 1,
                })
            ),
        },
        guards: [-1, 1].map((side) => ({
            x: tileCenter(x + side),
            y: tileCenter(room.y + 2),
        })),
    }
}
