import { describe, expect, it } from 'vitest'

import { selectionIntersectsViewport } from './selectionViewport'

const viewport = { left: 100, top: 100, right: 300, bottom: 250 }

describe('selection viewport', () => {
    it('rejects off-screen actors but accepts the visible part of a sprite', () => {
        const target = { kind: 'character', position: { x: 320, y: 180 } }
        expect(selectionIntersectsViewport(target, viewport)).toBe(false)
        expect(
            selectionIntersectsViewport({ ...target, position: { x: 305, y: 180 } }, viewport)
        ).toBe(true)
        expect(
            selectionIntersectsViewport({ ...target, position: { x: 200, y: 280 } }, viewport)
        ).toBe(false)
    })
    it('checks authored surfaces rather than a large compound object bounding rectangle', () => {
        const target = {
            kind: 'world',
            position: { x: 400, y: 400 },
            bounds: { x: 0, y: 0, width: 500, height: 500 },
            interactionAreas: [{ x: 350, y: 350, width: 16, height: 16 }],
        }
        expect(selectionIntersectsViewport(target, viewport)).toBe(false)
        target.interactionAreas.push({ x: 290, y: 220, width: 16, height: 16 })
        expect(selectionIntersectsViewport(target, viewport)).toBe(true)
    })
})
