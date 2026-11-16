import { describe, expect, it } from 'vitest'

import { distanceToBounds, nearestByKind } from './interactionTargets'

it('keeps the closest target of each action kind without hiding different choices', () => {
    const targets = [
        { id: 'far-herbs', kind: 'herbs', distance: 30 },
        { id: 'wood', kind: 'wood', distance: 22 },
        { id: 'near-herbs', kind: 'herbs', distance: 10 },
    ]
    expect(
        nearestByKind(
            targets,
            (target) => target.kind,
            (target) => target.distance
        ).map((target) => target.id)
    ).toEqual(['near-herbs', 'wood'])
})
describe('world object interaction reach', () => {
    it('measures the accessible outside edge rather than the middle of a large water object', () => {
        const pond = { x: 100, y: 100, width: 160, height: 96 }
        expect(distanceToBounds({ x: 80, y: 120 }, pond)).toBe(20)
        expect(distanceToBounds({ x: 96, y: 97 }, pond)).toBe(5)
        expect(distanceToBounds({ x: 150, y: 120 }, pond)).toBe(0)
    })
})
