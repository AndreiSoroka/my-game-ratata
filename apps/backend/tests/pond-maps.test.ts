import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { WORLD_LOCATION_DEFINITIONS } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { loadWorldObjects } from '../src/game/worldObjectData'

interface GeneratedMap {
    width: number
    height: number
    layers: Array<{ name: string; data?: number[] }>
}
const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../frontend/public/game/map'
)
function waterComponents(map: GeneratedMap): Array<Set<number>> {
    const terrain =
        map.layers.find((layer) => layer.name === 'Paths and ponds')?.data ?? []
    const unseen = new Set(
        terrain.flatMap((gid, cell) => (gid >= 110 && gid < 134 ? [cell] : []))
    )
    const result: Array<Set<number>> = []
    while (unseen.size > 0) {
        const first = unseen.values().next().value
        if (first === undefined) {
            break
        }
        const component = new Set([first])
        unseen.delete(first)
        for (const cell of component) {
            const x = cell % map.width,
                y = Math.floor(cell / map.width)
            for (const [nx, ny] of [
                [x - 1, y],
                [x + 1, y],
                [x, y - 1],
                [x, y + 1],
            ]) {
                if (
                    nx === undefined ||
                    ny === undefined ||
                    nx < 0 ||
                    nx >= map.width ||
                    ny < 0 ||
                    ny >= map.height
                ) {
                    continue
                }
                const next = ny * map.width + nx
                if (unseen.delete(next)) {
                    component.add(next)
                }
            }
        }
        result.push(component)
    }
    return result
}

describe('generated pond footprints', () => {
    it.each(WORLD_LOCATION_DEFINITIONS.map((location) => location.id))(
        '%s exposes each small pond as one exact water union and omits large lakes',
        (id) => {
            const map = JSON.parse(
                fs.readFileSync(path.join(root, `${id}.json`), 'utf8')
            ) as GeneratedMap
            const ponds = loadWorldObjects(id).filter(
                (object) => object.interactionAreas !== undefined
            )
            const seen = new Set<string>()
            for (const component of waterComponents(map)) {
                const matches = ponds.filter(
                    (pond) =>
                        pond.interactionAreas?.some((area) =>
                            component.has(
                                (area.y / 16) * map.width + area.x / 16
                            )
                        ) === true
                )
                if (component.size > 64) {
                    expect(matches).toEqual([])
                    continue
                }
                expect(matches).toHaveLength(1)
                const pond = matches[0]
                if (pond === undefined) {
                    throw new Error('Missing pond')
                }
                expect(seen.has(pond.id)).toBe(false)
                seen.add(pond.id)
                const footprint = new Set<number>()
                for (const area of pond.interactionAreas ?? []) {
                    for (
                        let y = area.y / 16;
                        y < (area.y + area.height) / 16;
                        y++
                    ) {
                        for (
                            let x = area.x / 16;
                            x < (area.x + area.width) / 16;
                            x++
                        ) {
                            footprint.add(y * map.width + x)
                        }
                    }
                }
                expect(footprint).toEqual(component)
                const first = Math.min(...component)
                expect(pond.id).toBe(
                    `${id}:water:pond:${String(first % map.width)}:${String(Math.floor(first / map.width))}`
                )
            }
            expect(seen.size).toBe(ponds.length)
        }
    )
})
