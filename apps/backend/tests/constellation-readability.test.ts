import assert from 'node:assert/strict'

import type { ConstellationRegion } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import {
    segmentsConflict,
    type SkyPoint,
} from '../src/game/constellationGeometry'
import { generateConstellationLayout } from '../src/game/constellationLayout'
import { fullConstellationCatalog } from '../src/game/constellationNodes'
import {
    describeComponent,
    packComponents,
} from '../src/game/constellationPacking'

it('places dependency neighbors without putting an unrelated school in their corridor', () => {
    const components = [
        describeComponent({
            'a.root': { x: 0, y: 0 },
            'a.tip': { x: 800, y: -200 },
        }),
        describeComponent({
            'unrelated.root': { x: 0, y: 0 },
            'unrelated.tip': { x: 1800, y: 1800 },
        }),
        describeComponent({
            'c.root': { x: 0, y: 0 },
            'c.tip': { x: -200, y: 700 },
        }),
    ]
    const before = structuredClone(components)
    const positions = packComponents(components, 'a.root', () => 0.3, false, [
        { from: 'a.tip', to: 'c.tip', crossLink: true },
    ])
    assert(positions !== undefined)
    const root = required(positions['unrelated.root']),
        tip = required(positions['unrelated.tip'])
    const body = {
        x: Math.min(root.x, tip.x),
        y: Math.min(root.y, tip.y),
        width: Math.abs(root.x - tip.x),
        height: Math.abs(root.y - tip.y),
    }
    expect(
        crossesRectangle(
            required(positions['a.tip']),
            required(positions['c.tip']),
            body
        )
    ).toBe(false)
    expect(components).toEqual(before)
})

for (const seed of [
    'readability-probe',
    'linked-schools',
    'region-corridors',
]) {
    for (const center of [
        'blade',
        'prayer',
        'magic',
        'arrow',
        'life',
    ] as const) {
        it(`keeps the entire ${seed}/${center} prerequisite paths outside foreign school bodies`, () => {
            const sky = generateConstellationLayout(
                fullConstellationCatalog,
                seed,
                center
            )
            const owners = new Map(
                fullConstellationCatalog.map((node) => [
                    node.id,
                    node.constellationId,
                ])
            )
            for (const node of fullConstellationCatalog) {
                for (const from of node.parents) {
                    const vertices = [
                        required(sky.positions[from]),
                        ...(sky.edgeWaypoints[`${from}>${node.id}`] ?? []),
                        required(sky.positions[node.id]),
                    ]
                    const view = sky.layout.bounds
                    expect(
                        vertices.every(
                            (point) =>
                                point.x >= view.x &&
                                point.y >= view.y &&
                                point.x <= view.x + view.width &&
                                point.y <= view.y + view.height
                        ),
                        `${from}>${node.id} clipped by overview`
                    ).toBe(true)
                    for (const [id, bounds] of Object.entries(
                        sky.layout.regions
                    )) {
                        if (
                            id === owners.get(from) ||
                            id === node.constellationId
                        ) {
                            continue
                        }
                        for (let step = 1; step < vertices.length; step += 1) {
                            expect(
                                crossesRectangle(
                                    required(vertices[step - 1]),
                                    required(vertices[step]),
                                    bounds
                                ),
                                `${from}>${node.id} through ${id}`
                            ).toBe(false)
                        }
                    }
                }
            }
        })
    }
}

/** Independent boundary audit: point inclusion plus intersections with the four rectangle edges. */
function crossesRectangle(
    a: SkyPoint,
    b: SkyPoint,
    bounds: ConstellationRegion
): boolean {
    const inside = (p: SkyPoint) =>
        p.x >= bounds.x &&
        p.x <= bounds.x + bounds.width &&
        p.y >= bounds.y &&
        p.y <= bounds.y + bounds.height
    if (inside(a) || inside(b)) {
        return true
    }
    const corners = [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        { x: bounds.x, y: bounds.y + bounds.height },
    ]
    return corners.some((point, index) =>
        segmentsConflict(a, b, point, required(corners[(index + 1) % 4]))
    )
}
function required(value: SkyPoint | undefined): SkyPoint {
    assert(value !== undefined)
    return value
}
