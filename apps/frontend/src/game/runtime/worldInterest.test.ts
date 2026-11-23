import type { AdventureResourceNode } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { WorldInterestCache } from './worldInterest'

const bounds = { left: 100, top: 100, right: 200, bottom: 200 }
function tree(id: string, x: number): AdventureResourceNode {
    return {
        id,
        kind: 'wood',
        source: 'tree',
        phase: 'ready',
        locationId: 'map-2-2',
        position: { x, y: 150 },
        remaining: 8,
    }
}

it('retains omitted resources outside a partial view and reconciles omissions inside it', () => {
    const cache = new WorldInterestCache<AdventureResourceNode>()
    const inside = tree('inside', 150)
    const outside = tree('outside', 500)
    cache.update([inside, outside])
    const result = cache.update([], bounds)
    expect(result.nodes).toEqual([outside])
    expect(result.removed).toEqual([inside])
    expect(cache.update([inside], bounds).nodes).toEqual([outside, inside])
})

it('updates depleted and removed states on reentry without changing cached snapshot objects', () => {
    const cache = new WorldInterestCache<AdventureResourceNode>()
    const ready = tree('tree', 150)
    cache.update([ready])
    cache.update([], { left: 400, top: 100, right: 600, bottom: 200 })
    const stump = { ...ready, phase: 'stump' as const, remaining: 0 }
    expect(cache.update([stump], bounds).nodes).toEqual([stump])
    const removed = { ...stump, phase: 'removed' as const }
    expect(cache.update([removed], bounds).nodes).toEqual([removed])
    expect(ready.phase).toBe('ready')
})

it('uses authored bounds and the sprite footprint consistently with server culling', () => {
    const cache = new WorldInterestCache<AdventureResourceNode>()
    const canopy = {
        ...tree('canopy', 260),
        bounds: { x: 180, y: 140, width: 160, height: 20 },
    }
    const sprite = tree('sprite', 225)
    const outside = tree('outside', 240)
    cache.update([canopy, sprite, outside])
    const result = cache.update([], bounds)
    expect(result.removed).toEqual([canopy, sprite])
    expect(result.nodes).toEqual([outside])
})

it('replaces a full resource list and forgets the old map when cleared', () => {
    const cache = new WorldInterestCache<AdventureResourceNode>()
    cache.update([tree('old', 500)])
    expect(cache.update([]).nodes).toEqual([])
    cache.update([tree('old', 500)])
    cache.clear()
    expect(cache.update([tree('new', 150)], bounds).nodes.map((node) => node.id)).toEqual(['new'])
})
