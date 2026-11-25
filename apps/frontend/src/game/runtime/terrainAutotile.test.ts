import { describe, expect, it, vi } from 'vitest'

import { drawConnectedTerrain, terrainQuadrants, terrainRegions } from './terrainAutotile'

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
    it.each([
        ['north edge', [0, 0, 0, 1, 1, 1, 1, 1, 1], [2, 2, 2, 2]],
        ['northwest outside corner', [0, 0, 0, 0, 1, 1, 0, 1, 1], [1, 1, 1, 1]],
        ['northwest inside corner', [0, 1, 1, 1, 1, 1, 1, 1, 1], [11, 11, 11, 11]],
        ['two northern inside corners', [0, 1, 0, 1, 1, 1, 1, 1, 1], [11, 10, 11, 10]],
    ])('chooses the water atlas sources for %s', (_, cells, expected) => {
        expect(terrainRegions(grid(cells), 3, 3, 4, 16, 16)?.map(({ tile }) => tile)).toEqual(
            expected
        )
    })
    it('fits both banks of a one-tile inlet at the authored map scale', () => {
        const cells = grid([0, 0, 0, 0, 1, 1, 0, 0, 0])
        const regions = terrainRegions(cells, 3, 3, 4, 32, 32)
        expect(
            regions?.map(({ tile, sourceY, sourceHeight, x, y, width, height }) => [
                tile,
                sourceY,
                sourceHeight,
                x,
                y,
                width,
                height,
            ])
        ).toEqual([
            [1, 0, 16, 32, 32, 16, 24],
            [13, 43, 5, 32, 56, 16, 8],
            [2, 0, 16, 48, 32, 16, 24],
            [14, 43, 5, 48, 56, 16, 8],
        ])
    })
    it.each([
        ['west', [0, 0, 0, 1, 1, 1, 0, 1, 1], 16, [12, 13, 14, 15], 5],
        ['east', [0, 0, 0, 1, 1, 1, 1, 1, 0], 24, [15, 14, 13, 12], 4],
    ])('tapers the %s concave bank into open water', (_, cells, x, heights, southTile) => {
        const regions = terrainRegions(grid(cells), 3, 3, 4, 16, 16)
        expect(
            regions?.filter(({ sourceHeight }) => sourceHeight === 16).map(({ height }) => height)
        ).toEqual(heights)
        expect(
            regions
                ?.filter(({ tile }) => tile === southTile)
                .map((region) => [region.x, region.y, region.width, region.height])
        ).toEqual(heights.map((height, index) => [x + index * 2, 16 + height, 2, 16 - height]))
    })
    it('keeps dirt atlas sources independent of water bank art', () => {
        const cells = [0, 0, 0, 46, 46, 46, 46, 46, 46]
        expect(terrainRegions(cells, 3, 3, 4, 16, 16)?.map(({ tile }) => tile)).toEqual([
            2, 2, 8, 8,
        ])
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
