import { recordProp } from './generate-depth.mjs'
import { pavingGid } from './generate-ground.mjs'
import { addInteriorBuilding } from './generate-interiors.mjs'

const town = 512

// Kenney Tiny Town 1.1, original 16px packed atlas. No images are rescaled.
export function addNovogorod(ctx) {
    const {
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
    } = ctx
    const landmarks = []
    const fronts = []
    const buildings = []
    const interiorDestinations = []
    const covers = Array(width * height).fill(0)
    const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height
    const paint = (layer, x, y, tile) => {
        if (inside(x, y)) layer[at(x, y)] = town + tile
    }
    const block = (x, y, value = 1) => {
        if (inside(x, y)) solid[at(x, y)] = value
    }
    for (let y = 9; y <= 70; y += 1)
        for (let x = 10; x <= 86; x += 1) {
            const i = at(x, y)
            grass[i] = 37
            terrain[i] = 0
            plants[i] = random() < 0.1 ? 17 : 0
            structures[i] = 0
            objects[i] = 0
            solid[i] = 0
        }
    function ground(x, y, tile) {
        if (!inside(x, y) || solid[at(x, y)] !== 0) return
        // Flat top-down paving avoids turning the road into a rock wall.
        terrain[at(x, y)] = tile === undefined ? pavingGid : town + tile
        plants[at(x, y)] = 0
        objects[at(x, y)] = 0
    }
    for (let x = 0; x < width; x += 1)
        for (let dy = -2; dy <= 2; dy += 1) ground(x, 40 + dy)
    for (let y = 0; y < height; y += 1)
        for (let dx = -2; dx <= 2; dx += 1) ground(48 + dx, y)
    for (let y = 35; y <= 53; y += 1)
        for (let x = 37; x <= 58; x += 1) ground(x, y)

    function landmark(name, kind, x, y) {
        landmarks.push({
            id: landmarks.length + 1,
            name,
            type: 'landmark',
            point: true,
            x: x * 16 + 8,
            y: y * 16 + 8,
            width: 0,
            height: 0,
            rotation: 0,
            visible: true,
            properties: [{ name: 'kind', type: 'string', value: kind }],
        })
    }
    function building(definition) {
        const result = addInteriorBuilding(
            { ...ctx, covers },
            {
                id: 100 + buildings.length,
                ...definition,
            }
        )
        buildings.push(result.object)
        fronts.push(result.front)
        interiorDestinations.push(...result.destinations)
    }
    function tower(x, y, h = 5) {
        for (let dy = 0; dy < h; dy += 1)
            for (let dx = 0; dx < 3; dx += 1) {
                paint(
                    structures,
                    x + dx,
                    y + dy,
                    dy === 0 ? 96 + dx : dy === h - 1 ? 120 + dx : 108 + dx
                )
                block(x + dx, y + dy)
            }
        paint(objects, x + 1, y + h - 2, 125)
    }
    // The walls have four broad, visibly open gates; the outer four tiles stay free.
    for (let x = 12; x <= 84; x += 1) {
        if (Math.abs(x - 48) <= 3) continue
        for (const y of [12, 67]) {
            paint(structures, x, y, 100)
            block(x, y)
        }
    }
    for (let y = 12; y <= 67; y += 1) {
        if (Math.abs(y - 40) <= 3) continue
        for (const x of [12, 84]) {
            paint(structures, x, y, 123)
            block(x, y)
        }
    }
    for (const [x, y] of [
        [11, 10],
        [82, 10],
        [11, 64],
        [82, 64],
        [42, 10],
        [51, 10],
        [42, 64],
        [51, 64],
    ])
        tower(x, y)

    building({
        name: 'Гильдия искателей',
        kind: 'guild',
        x: 35,
        y: 23,
        w: 11,
        h: 10,
        stone: true,
        occupant: [40, 28],
    })
    building({
        name: 'Часовня памяти',
        kind: 'chapel',
        x: 51,
        y: 22,
        w: 8,
        h: 11,
        red: true,
        stone: true,
        occupant: [55, 27],
    })
    // The bell tower remains visible above the northern end of the chapel.
    tower(54, 18, 6)
    paint(objects, 55, 21, 94)
    building({
        name: 'Городская библиотека',
        kind: 'library',
        x: 61,
        y: 29,
        w: 10,
        h: 9,
        stone: true,
        occupant: [66, 33],
    })
    building({
        name: 'Таверна «Три дороги»',
        kind: 'inn',
        x: 23,
        y: 46,
        w: 11,
        h: 9,
        red: true,
        occupant: [27, 50],
        extraOccupants: [[30, 50]],
    })
    building({
        name: 'Мастерские',
        kind: 'workshop',
        x: 17,
        y: 27,
        w: 8,
        h: 8,
        occupant: [21, 31],
    })
    building({
        name: 'Кузница',
        kind: 'smithy',
        x: 73,
        y: 46,
        w: 9,
        h: 9,
        stone: true,
        occupant: [77, 50],
    })
    building({
        name: 'Лавка Саввы',
        kind: 'shop',
        x: 35,
        y: 57,
        w: 10,
        h: 8,
        occupant: [40, 60],
    })
    building({
        name: 'Дом травницы',
        kind: 'home',
        x: 52,
        y: 57,
        w: 8,
        h: 8,
        red: true,
        occupant: [56, 60],
    })
    building({
        name: 'Дом пекаря',
        kind: 'home',
        x: 22,
        y: 15,
        w: 8,
        h: 8,
        red: true,
        occupant: [26, 18],
    })
    building({
        name: 'Дом картографа',
        kind: 'home',
        x: 73,
        y: 26,
        w: 9,
        h: 8,
        occupant: [77, 29],
    })
    building({
        name: 'Дом ткача',
        kind: 'home',
        x: 62,
        y: 15,
        w: 9,
        h: 8,
        occupant: [66, 18],
    })

    function stall(x, y, red) {
        const base = red ? 52 : 48
        for (let dx = 0; dx < 4; dx += 1) {
            paint(
                structures,
                x + dx,
                y,
                base + (dx === 0 ? 0 : dx === 3 ? 2 : 1)
            )
            paint(
                structures,
                x + dx,
                y + 1,
                base + 12 + (dx === 0 ? 0 : dx === 3 ? 2 : 1)
            )
            paint(objects, x + dx, y + 2, dx === 0 ? 80 : dx === 3 ? 82 : 81)
            block(x + dx, y)
            block(x + dx, y + 1)
            block(x + dx, y + 2)
        }
        paint(objects, x + 1, y + 2, 107)
        paint(objects, x + 2, y + 2, 129)
        fronts.push([x + 1, y + 3])
    }
    stall(52, 44, true)
    stall(35, 44, false)
    stall(31, 35, true)
    // A covered well, crates, woodpiles and an archery target give the streets scale.
    for (const [x, y, tile] of [
        [56, 36, 104],
        [33, 53, 106],
        [72, 51, 107],
        [76, 56, 95],
        [45, 55, 57],
        [51, 55, 83],
    ]) {
        paint(objects, x, y, tile)
        block(x, y)
    }
    // The herb garden is intentionally walkable, with gaps in its low fence.
    for (let y = 58; y <= 64; y += 1)
        for (let x = 16; x <= 29; x += 1) {
            ground(x, y, 25)
            if ((x + y) % 3 === 0) plants[at(x, y)] = 25
        }
    for (const y of [57, 65])
        for (let x = 16; x <= 29; x += 1) {
            if (x === 22 || x === 23 || x === 28) continue
            paint(objects, x, y, 81)
            block(x, y)
        }

    // Every open door connects to the streets; furniture must not trap a resident.
    function paveRoute(target, pave = true) {
        const start = at(48, 40)
        const end = at(...target)
        if (!inside(...target) || solid[end] !== 0)
            throw new Error(`Blocked city destination ${target}`)
        const parents = new Int32Array(width * height).fill(-1)
        const queue = [start]
        parents[start] = start
        for (
            let cursor = 0;
            cursor < queue.length && parents[end] === -1;
            cursor += 1
        ) {
            const index = queue[cursor]
            const x = index % width
            const y = Math.floor(index / width)
            for (const [dx, dy] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ]) {
                if (!inside(x + dx, y + dy)) continue
                const next = at(x + dx, y + dy)
                if (parents[next] !== -1 || solid[next] !== 0) continue
                parents[next] = index
                queue.push(next)
            }
        }
        if (parents[end] === -1)
            throw new Error(`Unreachable city destination ${target}`)
        for (let index = end; pave && index !== start; index = parents[index])
            ground(index % width, Math.floor(index / width))
    }
    for (const point of [
        ...fronts,
        ...ctx.keyPoints,
        [48, 0],
        [48, 79],
        [0, 40],
        [95, 40],
    ])
        paveRoute(point)

    for (const target of interiorDestinations) paveRoute(target, false)

    // Tiny Town's pine is a two-tile asset: crown4 + trunk16. Place after
    // paving so a walkable crown cannot be erased by a later ground write.
    for (const [x, y] of [
        [17, 17],
        [18, 21],
        [80, 17],
        [78, 60],
        [79, 64],
        [18, 48],
        [18, 52],
    ]) {
        if (!inside(x, y + 1)) continue
        const cells = [at(x, y), at(x, y + 1)]
        if (
            cells.some(
                (cell) =>
                    solid[cell] ||
                    structures[cell] ||
                    objects[cell] ||
                    terrain[cell]
            )
        )
            continue
        paint(objects, x, y, 4)
        paint(objects, x, y + 1, 16)
        block(x, y, 0)
        block(x, y + 1)
        recordProp(ctx, x, y, 1, 2, [town + 4, town + 16], 'tree')
    }

    landmark('Лавка Саввы', 'shop', 40, 66)
    landmark('Гильдия искателей', 'guild', 40, 38)
    landmark('Часовня памяти', 'chapel', 55, 38)
    landmark('Городская библиотека', 'library', 66, 39)
    landmark('Таверна «Три дороги»', 'inn', 28, 56)
    landmark('Мастерские', 'workshop', 21, 36)
    landmark('Кузница', 'smithy', 77, 56)
    landmark('Торговые ряды', 'market', 54, 48)
    landmark('Лекарский сад', 'garden', 22, 64)
    landmark('Северные ворота', 'gate', 48, 14)
    landmark('Южные ворота', 'gate', 48, 67)
    landmark('Западные ворота', 'gate', 12, 40)
    landmark('Восточные ворота', 'gate', 84, 40)
    landmark('Площадь Новогорода', 'plaza', 48, 35)
    return { landmarks, buildings, covers }
}
