import { describe, expect, it } from 'vitest'

import { depthPropData } from './mapDepthProps'
import type { TiledLandmark } from './mapLandmarks'

const tree: TiledLandmark = {
    id: 4,
    name: 'tree',
    type: 'depth_prop',
    x: 16,
    y: 32,
    width: 32,
    height: 48,
    properties: [
        { name: 'baseY', value: 76 },
        { name: 'columns', value: 2 },
        { name: 'tiles', value: '[1,2,3,4,5,6]' },
    ],
}

describe('complete depth props', () => {
    it('keeps the entire crown and trunk in one prop with authored foot depth', () => {
        expect(depthPropData(tree)).toEqual({
            width: 32,
            height: 48,
            baseY: 76,
            columns: 2,
            tiles: [1, 2, 3, 4, 5, 6],
        })
    })
    it('rejects malformed tile data before creating render actors', () => {
        const properties = tree.properties!.map((property) =>
            property.name === 'tiles' ? { ...property, value: '[1,"bad"]' } : property
        )
        expect(depthPropData({ ...tree, properties })).toBeUndefined()
    })
})
