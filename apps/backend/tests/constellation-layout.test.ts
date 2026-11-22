import { describe, expect, it } from 'vitest'

import { skyComponents } from '../src/game/constellationComponents'
import { generateConstellationLayout } from '../src/game/constellationLayout'
import type { RealizedConstellationLayout } from '../src/game/constellationLayoutTypes'
import { fullConstellationCatalog as expandedConstellationCatalog } from '../src/game/constellationNodes'
import { constellationTemplatePositions } from '../src/game/constellationTemplates'
import { catalogueWithoutUndeadExpansion as fullConstellationCatalog } from './constellationCatalogueFixture'
import { auditPersonalSky } from './personalSkyAudit'

const centers = ['blade', 'magic', 'prayer', 'arrow', 'undead'] as const

describe('personal planar skies', () => {
    it('keeps the full catalogue and certified components', () => {
        expect(fullConstellationCatalog).toHaveLength(192)
        expect(
            fullConstellationCatalog.flatMap((node) => node.parents)
        ).toHaveLength(209)
        expect(skyComponents(fullConstellationCatalog)).toHaveLength(10)
    })

    it('packs all 39 Undead stars in one connected component', () => {
        const undeadIds = expandedConstellationCatalog
            .filter((node) => node.constellationId === 'undead')
            .map(({ id }) => id)
        expect(undeadIds).toHaveLength(39)
        const component = skyComponents(expandedConstellationCatalog).find(
            ({ ids }) => ids.includes('undead.root')
        )
        expect(component?.ids).toEqual(expect.arrayContaining(undeadIds))
    })

    it.each(centers)(
        'independently audits 256 seeds with %s at the center, including hidden stars',
        (center) => {
            for (let seed = 0; seed < 256; seed += 1) {
                const sky = generateConstellationLayout(
                    expandedConstellationCatalog,
                    `personal-sky:${String(seed)}`,
                    center
                )
                expect(
                    auditPersonalSky(expandedConstellationCatalog, sky),
                    `seed ${String(seed)}, ${center}`
                ).toBeUndefined()
                expect(Object.keys(sky.positions)).toHaveLength(
                    expandedConstellationCatalog.length
                )
                expect(sky.positions[`${center}.root`]).toEqual({ x: 0, y: 0 })
                expect(sky.layout.centerNodeId).toBe(`${center}.root`)
                expect(sky.layout.bounds.x + sky.layout.bounds.width / 2).toBe(
                    0
                )
                expect(sky.layout.bounds.y + sky.layout.bounds.height / 2).toBe(
                    0
                )
                expect(sky.diagnostics.attempts).toBeLessThanOrEqual(32)
                expect(sky.layout.minimumNodeSpacing).toBeGreaterThanOrEqual(80)
            }
        },
        180000
    )

    it('replays one seed exactly and changes both roots and internal shape for another identity', () => {
        const first = generateConstellationLayout(
            expandedConstellationCatalog,
            'identity-a',
            'prayer'
        )
        expect(
            generateConstellationLayout(
                expandedConstellationCatalog,
                'identity-a',
                'prayer'
            )
        ).toEqual(first)
        const second = generateConstellationLayout(
            expandedConstellationCatalog,
            'identity-b',
            'prayer'
        )
        const changed = Object.keys(first.positions).filter(
            (id) =>
                JSON.stringify(first.positions[id]) !==
                JSON.stringify(second.positions[id])
        )
        expect(changed).toHaveLength(expandedConstellationCatalog.length - 1)
        expect(distance(first, 'blade.damage1', 'blade.damage2')).not.toBe(
            distance(second, 'blade.damage1', 'blade.damage2')
        )
        expect(first.layout.regions).not.toEqual(second.layout.regions)
    })

    it('certifies a deterministic fallback for all starting constellations with zero random attempts', () => {
        for (const center of centers) {
            const sky = generateConstellationLayout(
                expandedConstellationCatalog,
                'forced-fallback',
                center,
                { maxAttempts: 0 }
            )
            expect(sky.diagnostics).toEqual({ attempts: 0, usedFallback: true })
            expect(
                auditPersonalSky(expandedConstellationCatalog, sky)
            ).toBeUndefined()
            expect(sky.positions[`${center}.root`]).toEqual({ x: 0, y: 0 })
            expect(
                generateConstellationLayout(
                    expandedConstellationCatalog,
                    'forced-fallback',
                    center,
                    { forceFallback: true }
                )
            ).toEqual(sky)
        }
    })
})

describe('natural constellation shape', () => {
    it('spreads complex root branches around all directions rather than rotating a one-sided comb', () => {
        const sky = generateConstellationLayout(
            expandedConstellationCatalog,
            'natural-directions',
            'blade'
        )
        for (const path of [
            'blade',
            'magic',
            'prayer',
            'arrow',
            'life',
            'shadow',
            'undead',
        ]) {
            const root = required(sky, `${path}.root`)
            const angles = expandedConstellationCatalog
                .filter((node) => node.parents.includes(`${path}.root`))
                .map((node) => {
                    const point = required(sky, node.id)
                    return Math.atan2(point.y - root.y, point.x - root.x)
                })
                .sort((a, b) => a - b)
            const gaps = angles.map(
                (angle, index) =>
                    (angles[index + 1] ?? (angles[0] ?? 0) + Math.PI * 2) -
                    angle
            )
            expect(Math.max(...gaps), path).toBeLessThan(Math.PI)
        }
    })

    it('changes leaf branch order beyond a global rotation or reflection', () => {
        const orders = new Set<string>()
        for (let seed = 0; seed < 16; seed += 1) {
            const sky = generateConstellationLayout(
                expandedConstellationCatalog,
                `leaf-order:${String(seed)}`,
                'blade'
            )
            orders.add(leafOrder(sky))
        }
        expect(orders.size).toBeGreaterThan(4)
    })

    it('reports actual minimum spacing and never mutates frozen templates or metadata', () => {
        const before = JSON.stringify(expandedConstellationCatalog)
        const templates = JSON.stringify(constellationTemplatePositions)
        const sky = generateConstellationLayout(
            expandedConstellationCatalog,
            'spacing-and-immutability',
            'magic'
        )
        const nodes = Object.values(sky.positions)
        const minimum = Math.min(
            ...nodes.flatMap((node, index) =>
                nodes
                    .slice(index + 1)
                    .map((other) =>
                        Math.hypot(node.x - other.x, node.y - other.y)
                    )
            )
        )
        expect(sky.layout.minimumNodeSpacing).toBe(Math.floor(minimum))
        expect(JSON.stringify(expandedConstellationCatalog)).toBe(before)
        expect(JSON.stringify(constellationTemplatePositions)).toBe(templates)
        expect(Object.isFrozen(constellationTemplatePositions)).toBe(true)
        expect(
            Object.values(constellationTemplatePositions).every(Object.isFrozen)
        ).toBe(true)
    })
})

function required(sky: RealizedConstellationLayout, id: string) {
    const point = sky.positions[id]
    if (point === undefined) {
        throw new Error(`Missing sky point: ${id}`)
    }
    return point
}
function distance(
    sky: RealizedConstellationLayout,
    a: string,
    b: string
): number {
    const first = required(sky, a),
        second = required(sky, b)
    return Math.hypot(first.x - second.x, first.y - second.y)
}
function leafOrder(sky: RealizedConstellationLayout): string {
    const root = required(sky, 'blade.root'),
        reference = required(sky, 'blade.damage1')
    const origin = Math.atan2(reference.y - root.y, reference.x - root.x)
    const ids = [
        'blade.economy',
        'blade.tempo',
        'blade.critical',
        'blade.dodge',
        'blade.resolve',
    ]
    const angle = (id: string) => {
        const point = required(sky, id)
        return (
            (Math.atan2(point.y - root.y, point.x - root.x) -
                origin +
                Math.PI * 2) %
            (Math.PI * 2)
        )
    }
    const ordered = ids.sort((a, b) => angle(a) - angle(b))
    return [ordered.join('|'), [...ordered].reverse().join('|')].sort()[0] ?? ''
}
