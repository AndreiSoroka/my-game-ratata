import { pavingGid } from './generate-ground.mjs'
import { rectangleCells } from './city-layout.mjs'

export function cityRoads(ctx, plan) {
    const { width, height, at, solid, terrain, plants, roads } = ctx
    const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height
    const ground = (x, y) => {
        if (!inside(x, y) || solid[at(x, y)]) return false
        terrain[at(x, y)] = pavingGid
        plants[at(x, y)] = 0
        roads[at(x, y)] = true
        return true
    }
    for (const rectangle of [...plan.roads, plan.plaza])
        for (const [x, y] of rectangleCells(rectangle)) ground(x, y)
    function route(target, pave = true) {
        const start = at(48, 40),
            end = at(...target)
        if (!inside(...target) || solid[end])
            throw new Error(`Blocked city destination: ${target}`)
        const parents = new Int32Array(width * height).fill(-1),
            queue = [start]
        parents[start] = start
        for (
            let index = 0;
            index < queue.length && parents[end] === -1;
            index++
        ) {
            const cell = queue[index],
                x = cell % width,
                y = Math.floor(cell / width)
            const steps =
                plan.style === 'organic' && (x + y) % 2
                    ? [
                          [0, 1],
                          [1, 0],
                          [0, -1],
                          [-1, 0],
                      ]
                    : [
                          [1, 0],
                          [0, 1],
                          [-1, 0],
                          [0, -1],
                      ]
            for (const [dx, dy] of steps) {
                if (!inside(x + dx, y + dy)) continue
                const next = at(x + dx, y + dy)
                if (parents[next] !== -1 || solid[next]) continue
                parents[next] = cell
                queue.push(next)
            }
        }
        if (parents[end] === -1)
            throw new Error(`Unreachable city destination: ${target}`)
        if (!pave) return
        const path = []
        for (let cell = end; cell !== start; cell = parents[cell])
            path.push(cell)
        path.push(start)
        for (let index = 0; index < path.length; index++) {
            const cell = path[index],
                x = cell % width,
                y = Math.floor(cell / width)
            ground(x, y)
            const next = path[index + 1] ?? path[index - 1]
            const horizontal =
                next !== undefined && Math.floor(next / width) === y
            const sides = horizontal
                ? [
                      [0, 1],
                      [0, -1],
                  ]
                : [
                      [1, 0],
                      [-1, 0],
                  ]
            for (const [dx, dy] of sides) if (ground(x + dx, y + dy)) break
        }
    }
    return { ground, route }
}
