import { describe, expect, it } from 'vitest'

import {
    constellationEdgeWaypoints,
    constellationLayout,
} from '../src/game/constellationLayout'
import { fullConstellationCatalog } from '../src/game/constellationNodes'
import { snapshotConstellations } from '../src/game/constellationSnapshot'
import { abilityHero } from './abilityTestHelpers'

describe('authored constellation geometry', () => {
    it('assigns every node a stable position with at least eighty units between nodes', () => {
        const nodes = fullConstellationCatalog
        expect(new Set(nodes.map((node) => node.id)).size).toBe(nodes.length)
        expect(nodes.filter((node) => node.kind === 'root')).toHaveLength(9)
        expect(
            nodes.filter((node) => node.constellationId === 'prayer')
        ).toHaveLength(20)
        for (const [index, node] of nodes.entries()) {
            const bounds = constellationLayout.bounds
            expect(node.x).toBeGreaterThanOrEqual(bounds.x)
            expect(node.y).toBeGreaterThanOrEqual(bounds.y)
            expect(node.x).toBeLessThanOrEqual(bounds.x + bounds.width)
            expect(node.y).toBeLessThanOrEqual(bounds.y + bounds.height)
            for (const other of nodes.slice(index + 1)) {
                expect(
                    Math.hypot(node.x - other.x, node.y - other.y),
                    `${node.id} / ${other.id}`
                ).toBeGreaterThanOrEqual(80)
            }
        }
    })

    it('keeps every segment, including both routed joint branches, clear of foreign node hit areas', () => {
        const nodes = fullConstellationCatalog
        for (const node of nodes) {
            for (const parentId of node.parents) {
                const parent = nodes.find(
                    (candidate) => candidate.id === parentId
                )
                if (parent === undefined) {
                    throw new Error(`Missing parent ${parentId}`)
                }
                const points = [
                    parent,
                    ...(constellationEdgeWaypoints(parentId, node.id) ?? []),
                    node,
                ]
                for (const foreign of nodes.filter(
                    (candidate) =>
                        candidate.id !== node.id && candidate.id !== parentId
                )) {
                    for (let index = 1; index < points.length; index += 1) {
                        const from = points[index - 1]
                        const to = points[index]
                        if (from === undefined || to === undefined) {
                            throw new Error('Missing authored edge vertex')
                        }
                        expect(
                            segmentDistance(foreign, from, to),
                            `${parentId} -> ${node.id} through ${foreign.id}`
                        ).toBeGreaterThanOrEqual(36)
                    }
                }
            }
        }
        const joints = nodes.filter((node) => node.kind === 'joint')
        expect(joints).toHaveLength(2)
        for (const joint of joints) {
            for (const parent of joint.parents) {
                expect(
                    constellationEdgeWaypoints(parent, joint.id)?.length
                ).toBeGreaterThan(0)
            }
        }
    })

    it('uses nine fixed 1100-square regions with a pitch of 1800 across all discovery states', () => {
        const rows = [
            ['blade', 'magic', 'prayer'],
            ['arrow', 'life', 'shadow'],
            ['prayer_road', 'prayer_lantern', 'prayer_grave'],
        ] as const
        for (const [row, paths] of rows.entries()) {
            for (const [column, path] of paths.entries()) {
                expect(constellationLayout.regions[path]).toEqual({
                    x: column * 1800,
                    y: row * 1800,
                    width: 1100,
                    height: 1100,
                })
            }
        }
        const actor = abilityHero('arcanist')
        const before = snapshotConstellations(actor)
        for (const node of fullConstellationCatalog) {
            actor.progression.constellations.opened.add(node.id)
        }
        actor.progression.skills.fireball.unlocked = true
        actor.progression.skills.greater_fireball.unlocked = true
        const after = snapshotConstellations(actor)
        expect(before.layout).toEqual(after.layout)
        for (const node of before.nodes) {
            expect(
                after.nodes.find((candidate) => candidate.id === node.id)
            ).toMatchObject({ x: node.x, y: node.y })
        }
    })
})

interface Point {
    x: number
    y: number
}
function segmentDistance(point: Point, from: Point, to: Point): number {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const lengthSquared = dx * dx + dy * dy
    const ratio =
        lengthSquared === 0
            ? 0
            : Math.max(
                  0,
                  Math.min(
                      1,
                      ((point.x - from.x) * dx + (point.y - from.y) * dy) /
                          lengthSquared
                  )
              )
    return Math.hypot(
        point.x - from.x - ratio * dx,
        point.y - from.y - ratio * dy
    )
}
