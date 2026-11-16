import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { WORLD_LOCATION_DEFINITIONS } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

const mapRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../frontend/public/game/map'
)
describe('generated pond connectivity', () => {
    it.each(WORLD_LOCATION_DEFINITIONS.map((location) => location.id))(
        '%s has no isolated water corners or one-tile strips',
        (id) => {
            const map = JSON.parse(
                fs.readFileSync(path.join(mapRoot, id + '.json'), 'utf8')
            ) as {
                width: number
                height: number
                layers: Array<{ name: string; data: number[] }>
            }
            const data = map.layers.find(
                (layer) => layer.name === 'Paths and ponds'
            )?.data
            if (data === undefined) {
                throw new Error('Missing terrain layer')
            }
            const remaining = new Set(
                data.flatMap((gid, index) =>
                    gid >= 110 && gid < 134 ? [index] : []
                )
            )
            for (const start of remaining) {
                remaining.delete(start)
                const cells = [start]
                for (const index of cells) {
                    const x = index % map.width,
                        y = Math.floor(index / map.width)
                    for (const [dx, dy] of [
                        [-1, 0],
                        [1, 0],
                        [0, -1],
                        [0, 1],
                    ] as const) {
                        const nx = x + dx,
                            ny = y + dy,
                            next = ny * map.width + nx
                        if (
                            nx >= 0 &&
                            ny >= 0 &&
                            nx < map.width &&
                            ny < map.height &&
                            remaining.delete(next)
                        ) {
                            cells.push(next)
                        }
                    }
                }
                const xs = cells.map((index) => index % map.width),
                    ys = cells.map((index) => Math.floor(index / map.width))
                expect(cells.length).toBeGreaterThanOrEqual(9)
                expect(
                    Math.max(...xs) - Math.min(...xs)
                ).toBeGreaterThanOrEqual(2)
                expect(
                    Math.max(...ys) - Math.min(...ys)
                ).toBeGreaterThanOrEqual(2)
            }
        }
    )
})
