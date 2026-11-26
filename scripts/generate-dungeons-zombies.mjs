const populationLimits = { small: 1, medium: 2, large: 3 }

/** Place at most one fat zombie per ordinary room without touching other spawn streams. */
export function fatZombieSpawnPoints({
    floor,
    size,
    rooms,
    grid,
    passages,
    skeletons,
    secretEntry,
    tileSize,
    roll,
}) {
    if (floor < 2) return []
    const limit = 1 + roll(populationLimits[size])
    const clearance = [
        { points: passages, radius: tileSize * 6 },
        { points: skeletons, radius: tileSize * 2 },
        {
            points: secretEntry === undefined ? [] : [secretEntry],
            radius: tileSize * 3,
        },
    ]
    const roomsWithSpace = rooms
        .map((room) => interiorPoints(room, grid, tileSize, clearance))
        .filter((points) => points.length > 0)
    const spawns = []
    while (spawns.length < limit && roomsWithSpace.length > 0) {
        const [room] = roomsWithSpace.splice(roll(roomsWithSpace.length), 1)
        const choices = room.filter((point) =>
            separated(point, spawns, tileSize * 2)
        )
        if (choices.length > 0) spawns.push(choices[roll(choices.length)])
    }
    return spawns
}

function interiorPoints(room, grid, tileSize, clearance) {
    const points = []
    for (let y = room.y + 1; y < room.y + room.height - 1; y++) {
        for (let x = room.x + 1; x < room.x + room.width - 1; x++) {
            if (grid.solid[grid.at(x, y)] !== 0) continue
            const point = { x: (x + 0.5) * tileSize, y: (y + 0.5) * tileSize }
            if (
                clearance.every(({ points, radius }) =>
                    separated(point, points, radius)
                )
            )
                points.push(point)
        }
    }
    return points
}

function separated(point, others, radius) {
    return others.every(
        ({ x, y }) => (point.x - x) ** 2 + (point.y - y) ** 2 > radius ** 2
    )
}
