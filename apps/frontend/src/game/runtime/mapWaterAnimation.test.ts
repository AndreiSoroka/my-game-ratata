import { describe, expect, it } from 'vitest'

import { readWaterAnimation } from './mapWaterAnimation'
import type { LoadedTileset } from './tiledMapAssets'

const waterAtlasUrl = 'https://example.test/region/assets/MysticWoods/tilesets/'
const waterTileset: LoadedTileset = {
    firstgid: 110,
    image: {
        src: `${waterAtlasUrl}water1.png`,
        naturalWidth: 96,
        naturalHeight: 64,
    } as HTMLImageElement,
    tileset: {
        name: 'water',
        image: '../../assets/MysticWoods/tilesets/water1.png',
        columns: 6,
        tilecount: 24,
        tilewidth: 16,
        tileheight: 16,
    },
}

const overlay = { name: 'Bridge', data: [17], type: 'tilelayer', visible: true }
const water = 118
const singleTile = {
    width: 1,
    height: 1,
    tilewidth: 16,
    tileheight: 16,
    layers: [{ name: 'Paths and ponds', data: [water], type: 'tilelayer', visible: true }],
}

describe('animated Mystic Woods shoreline', () => {
    it('finds five extra atlases and animates the complete concave bank at the authored scale', () => {
        const map = {
            width: 3,
            height: 3,
            tilewidth: 24,
            tileheight: 20,
            layers: [{ ...singleTile.layers[0]!, data: [0, ...Array<number>(8).fill(water)] }],
        }
        const animation = readWaterAnimation(map, [waterTileset], waterTileset)
        expect(animation?.baseAtlas).toBe(waterTileset.image)
        expect(animation?.frameUrls).toEqual(
            [2, 3, 4, 5, 6].map((frame) => `${waterAtlasUrl}water${frame}.png`)
        )
        expect(
            animation?.quarters.filter(({ x, y }) => x >= 24 && x < 48 && y >= 20 && y < 40)
        ).toEqual([
            { sourceX: 80, sourceY: 16, x: 24, y: 20, width: 12, height: 10 },
            { sourceX: 88, sourceY: 16, x: 36, y: 20, width: 12, height: 10 },
            { sourceX: 80, sourceY: 24, x: 24, y: 30, width: 12, height: 10 },
            { sourceX: 88, sourceY: 24, x: 36, y: 30, width: 12, height: 10 },
        ])
    })

    it('keeps an overlaid water cell in the static map', () => {
        const map = { ...singleTile, layers: [...singleTile.layers, overlay] }
        expect(readWaterAnimation(map, [waterTileset], waterTileset)).toBeUndefined()
    })

    it.each([
        { ...overlay, visible: false },
        { ...overlay, opacity: 0 },
        { ...overlay, name: 'Building covers' },
    ])('allows a shore under a layer rendered elsewhere or not painted: %j', (layer) => {
        const map = { ...singleTile, layers: [...singleTile.layers, layer] }
        expect(readWaterAnimation(map, [waterTileset], waterTileset)?.quarters).toHaveLength(4)
    })

    it.each([{ data: [46] }, { visible: false }, { opacity: 0.5 }])(
        'skips dry or non-opaque terrain: %j',
        (overrides) => {
            const map = { ...singleTile, layers: [{ ...singleTile.layers[0]!, ...overrides }] }
            expect(readWaterAnimation(map, [waterTileset], waterTileset)).toBeUndefined()
        }
    )

    it('uses the actual static tileset selected for the water GID', () => {
        const replacement = { ...waterTileset, firstgid: 116 }
        expect(
            readWaterAnimation(singleTile, [waterTileset, replacement], waterTileset)
        ).toBeUndefined()
        const unsupported = { ...waterTileset, firstgid: 200 }
        const map = { ...singleTile, layers: [{ ...singleTile.layers[0]!, data: [208] }] }
        expect(readWaterAnimation(map, [unsupported], unsupported)).toBeUndefined()
    })

    it('keeps custom atlas layout and art static', () => {
        const incompatible = { ...waterTileset, tileset: { ...waterTileset.tileset, columns: 8 } }
        expect(readWaterAnimation(singleTile, [incompatible], incompatible)).toBeUndefined()
        const custom = {
            ...waterTileset,
            image: { ...waterTileset.image, src: 'https://example.test/custom/water1.png' },
        }
        expect(readWaterAnimation(singleTile, [custom], custom)).toBeUndefined()
    })
})
