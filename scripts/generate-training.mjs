/** Fixed authored addition: never consumes the forest/city RNG sequence. */
export function addTrainingGround(ctx, locationId, ground) {
    const { at, terrain, plants, structures, objects, solid, roads, reserved } =
        ctx
    const areaId = `${locationId}:training:yard-1`
    const targetId = `${locationId}:training:dummy-1`
    for (let y = 43; y <= 56; y++)
        for (let x = 57; x <= 71; x++) {
            const cell = at(x, y)
            if (solid[cell] || structures[cell] || objects[cell]) {
                throw new Error(`Training ground overlaps city prop ${x}/${y}`)
            }
            terrain[cell] = 0
            plants[cell] = 0
            roads[cell] = false
            reserved[cell] = true
        }

    // Mystic Woods' original edge-connected wooden fence, GIDs 1–16.
    // Mark collision before the city routes are computed, so no service path
    // relies on walking through the newly fenced perimeter.
    function fence(x, y, gid) {
        objects[at(x, y)] = gid
        solid[at(x, y)] = 1
    }
    for (let x = 58; x <= 70; x++) {
        fence(x, 43, 15)
        fence(x, 56, 15)
    }
    for (let y = 44; y <= 55; y++) {
        fence(71, y, 5)
        if (y < 48 || y > 50) fence(57, y, y === 47 ? 9 : y === 51 ? 1 : 5)
    }
    fence(57, 43, 2)
    fence(71, 43, 4)
    fence(57, 56, 10)
    fence(71, 56, 12)
    for (let y = 48; y <= 50; y++) for (let x = 56; x <= 59; x++) ground(x, y)
    for (let x = 60; x <= 67; x++) ground(x, 49)

    const stringProperty = (name, value) => ({ name, type: 'string', value })
    return [
        {
            id: 40000,
            name: 'Тренировочный загон',
            type: 'training_area',
            x: 58 * 16,
            y: 44 * 16,
            width: 13 * 16,
            height: 12 * 16,
            rotation: 0,
            visible: true,
            properties: [stringProperty('areaId', areaId)],
        },
        {
            id: 40001,
            name: 'Тренировочный манекен',
            type: 'training_dummy',
            point: true,
            x: 67 * 16 + 8,
            y: 49 * 16 + 8,
            width: 0,
            height: 0,
            rotation: 0,
            visible: true,
            properties: [
                stringProperty('targetId', targetId),
                stringProperty('areaId', areaId),
                stringProperty('visualId', 'training_dummy'),
            ],
        },
    ]
}
