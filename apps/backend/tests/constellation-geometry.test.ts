import { describe, expect, it } from 'vitest'

import {
    constellationGeometryProblem,
    segmentsConflict,
} from '../src/game/constellationGeometry'

describe('planar sky validation failures', () => {
    it('rejects proper crossings, unrelated endpoint touches and T-junctions', () => {
        expect(
            segmentsConflict(
                { x: 0, y: 0 },
                { x: 200, y: 200 },
                { x: 0, y: 200 },
                { x: 200, y: 0 }
            )
        ).toBe(true)
        expect(
            segmentsConflict(
                { x: 0, y: 0 },
                { x: 200, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 200 }
            )
        ).toBe(true)
        expect(
            segmentsConflict(
                { x: 0, y: 0 },
                { x: 200, y: 0 },
                { x: 200, y: 0 },
                { x: 300, y: 200 }
            )
        ).toBe(true)
    })

    it('allows only the exact common graph vertex, never an incident overlap or a second crossing', () => {
        const shared = { x: 0, y: 0 }
        expect(
            segmentsConflict(
                shared,
                { x: 200, y: 0 },
                shared,
                { x: 0, y: 200 },
                [shared]
            )
        ).toBe(false)
        expect(
            segmentsConflict(
                shared,
                { x: 200, y: 0 },
                shared,
                { x: 300, y: 0 },
                [shared]
            )
        ).toBe(true)
        expect(
            segmentsConflict(
                { x: 0, y: 0 },
                { x: 300, y: 0 },
                { x: 100, y: 0 },
                { x: 400, y: 0 }
            )
        ).toBe(true)
        const positions = {
            a: shared,
            b: { x: 400, y: 0 },
            c: { x: 0, y: 400 },
        }
        const edges = [
            { from: 'a', to: 'b' },
            {
                from: 'a',
                to: 'c',
                via: [
                    { x: 200, y: -200 },
                    { x: 200, y: 200 },
                ],
            },
        ]
        expect(constellationGeometryProblem(positions, edges)).toContain(
            'Intersecting edges'
        )
    })

    it('rejects foreign-node penetration and insufficient node spacing', () => {
        const positions = {
            a: { x: 0, y: 0 },
            b: { x: 400, y: 0 },
            foreign: { x: 200, y: 20 },
        }
        expect(
            constellationGeometryProblem(positions, [{ from: 'a', to: 'b' }])
        ).toContain('Edge through node')
        expect(
            constellationGeometryProblem(
                { a: { x: 0, y: 0 }, b: { x: 79, y: 0 } },
                []
            )
        ).toContain('Close nodes')
    })

    it('rejects a self-crossing polyline before publishing a routed edge', () => {
        const positions = { a: { x: 0, y: 0 }, b: { x: 400, y: 0 } }
        const via = [
            { x: 300, y: 300 },
            { x: 0, y: 300 },
            { x: 300, y: 0 },
        ]
        expect(
            constellationGeometryProblem(positions, [
                { from: 'a', to: 'b', via },
            ])
        ).toContain('Self-intersection')
    })
})
