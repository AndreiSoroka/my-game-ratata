import { describe, expect, it, vi } from 'vitest'

import { drawConnectedTerrain, terrainQuadrants } from './terrainAutotile'

const tile = 110 + 8
const grid = (cells: number[]) => cells.map((value) => (value ? tile : 0))
describe('connected terrain atlas quadrants', () => {
    it('fills continuous water and paths without a repeated shoreline', () => {
        expect(terrainQuadrants(grid([1, 1, 1, 1, 1, 1, 1, 1, 1]), 3, 3, 4)).toEqual([8, 8, 8, 8])
    })
    it.each([
        [0, 11],
        [2, 10],
        [6, 5],
        [8, 4],
    ])('uses the actual concave corner for missing diagonal %s', (missing, inner) => {
        const cells = Array<number>(9).fill(1)
        cells[missing] = 0
        const quadrants = terrainQuadrants(grid(cells), 3, 3, 4)!
        const corner = [0, 2, 6, 8].indexOf(missing)
        expect(quadrants[corner]).toBe(inner)
        expect(quadrants.filter((_, index) => index !== corner)).toEqual([8, 8, 8])
    })
    it('rounds the exterior corner while keeping the joined inside seamless', () => {
        expect(terrainQuadrants(grid([0, 0, 0, 0, 1, 1, 0, 1, 1]), 3, 3, 4)).toEqual([1, 2, 7, 8])
    })
    it('does not connect dirt paths to neighboring water', () => {
        const cells = grid([1, 1, 1, 1, 1, 1, 1, 1, 1])
        cells[4] = 38 + 8
        expect(terrainQuadrants(cells, 3, 3, 4)).toEqual([1, 3, 13, 15])
        expect(terrainQuadrants([0], 1, 1, 0)).toBeUndefined()
    })
    it('draws four matching source quarters at the authored map scale', () => {
        const drawImage = vi.fn<CanvasRenderingContext2D['drawImage']>()
        const image = {} as HTMLImageElement
        expect(
            drawConnectedTerrain(
                { drawImage } as unknown as CanvasRenderingContext2D,
                image,
                grid([1, 1, 1, 1, 1, 1, 1, 1, 1]),
                3,
                3,
                4,
                32,
                32
            )
        ).toBe(true)
        expect(drawImage).toHaveBeenCalledTimes(4)
        expect(drawImage.mock.calls[0]).toEqual([image, 32, 16, 8, 8, 32, 32, 16, 16])
        expect(drawImage.mock.calls[3]).toEqual([image, 40, 24, 8, 8, 48, 48, 16, 16])
    })
})
