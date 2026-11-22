import type { ConstellationSnapshot } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { observedPathBounds } from './constellationFocusRegion'
import { constellationLabels } from './constellationLabels'

const view = { x: -260, y: -200, width: 520, height: 400 }
const sky: ConstellationSnapshot = {
    version: 1,
    paths: [
        { id: 'prayer', unlocked: true, name: 'Угольная Мать', color: '#fa0' },
        { id: 'blade', unlocked: false, color: '#aaa' },
    ],
    nodes: [
        {
            id: 'root',
            constellationId: 'prayer',
            x: -140,
            y: 0,
            unlocked: true,
            parents: [],
            name: 'Молитва',
        },
        { id: 'child', constellationId: 'prayer', x: 70, y: 0, unlocked: true, parents: ['root'] },
        { id: 'foreign', constellationId: 'blade', x: 145, y: 40, unlocked: false, parents: [] },
    ],
    edges: [
        { from: 'root', to: 'child', via: [{ x: 10, y: -120 }] },
        { from: 'child', to: 'foreign', via: [{ x: 10000, y: 10000 }] },
    ],
}

it('uses the earned path name and omits transparent closed labels', () => {
    const labels = (showClosed: boolean) =>
        constellationLabels(sky, 'root', false, 1, view, showClosed)

    expect(labels(false).map(({ text }) => text)).toEqual(['Угольная Мать'])
    expect(labels(true).map(({ text }) => text)).toEqual(['Угольная Мать', 'Неизвестно'])
    expect(sky.nodes[0]?.name).toBe('Молитва')
})

it('fits received nodes and local bends without widening the view for foreign corridors', () => {
    expect(observedPathBounds(sky, 'prayer')).toEqual({ x: -140, y: -120, width: 210, height: 120 })
})
