import type { Engine } from 'excalibur'
import { describe, expect, it, vi } from 'vitest'

import { MapBackdrop } from './mapBackdrop'
import type { RenderedTiledMap } from './tiledMap'

interface GraphicOptions {
    width: number
    height: number
    cache: boolean
    smoothing: boolean
    draw: (context: CanvasRenderingContext2D) => void
}
interface ViewActor {
    options: { pos: { x: number; y: number }; width: number; height: number; z: number }
    graphics: { use: ReturnType<typeof vi.fn<(graphic: { options: GraphicOptions }) => void>> }
    kill: ReturnType<typeof vi.fn<() => void>>
}

vi.mock('excalibur', () => ({
    Actor: class {
        public graphics = { use: vi.fn<(graphic: { options: GraphicOptions }) => void>() }
        public kill = vi.fn<() => void>()
        public constructor(public options: ViewActor['options']) {}
    },
    Canvas: class {
        public constructor(public options: GraphicOptions) {}
    },
    vec: (x: number, y: number) => ({ x, y }),
}))

const map = {
    worldWidth: 1536,
    worldHeight: 1280,
    tileWidth: 16,
    tileHeight: 16,
} as RenderedTiledMap

function setup() {
    const actors: ViewActor[] = []
    const backdrop = new MapBackdrop({
        add: (actor: ViewActor) => actors.push(actor),
    } as unknown as Engine)
    return { actors, backdrop }
}

describe('map void backdrop', () => {
    it('keeps cached star strips outside the physical map and below its graphics', () => {
        const { actors, backdrop } = setup()
        backdrop.setMap(map)
        expect(actors).toHaveLength(4)
        for (const actor of actors) {
            const { pos, width, height, z } = actor.options
            expect(z).toBeLessThan(-100)
            expect(
                pos.x + width <= 0 ||
                    pos.y + height <= 0 ||
                    pos.x >= map.worldWidth ||
                    pos.y >= map.worldHeight
            ).toBe(true)
            expect(actor.graphics.use.mock.calls[0]![0].options).toMatchObject({
                cache: true,
                smoothing: false,
            })
        }
    })

    it('draws sparse fixed pixel stars on black without frame randomness', () => {
        const { actors, backdrop } = setup()
        backdrop.setMap(map)
        const graphic = actors[0]!.graphics.use.mock.calls[0]![0].options
        const rectangles: { x: number; y: number; width: number; height: number; color: string }[] =
            []
        const context = {
            fillStyle: '',
            fillRect: (x: number, y: number, width: number, height: number) =>
                rectangles.push({ x, y, width, height, color: context.fillStyle }),
        }
        graphic.draw(context as unknown as CanvasRenderingContext2D)
        const firstDraw = [...rectangles]
        expect(firstDraw[0]).toEqual({
            x: 0,
            y: 0,
            width: graphic.width,
            height: graphic.height,
            color: '#000000',
        })
        const stars = firstDraw.slice(1)
        expect(stars.length).toBeGreaterThan(10)
        expect(stars.length).toBeLessThan((graphic.width * graphic.height) / 2000)
        for (const star of stars) {
            expect(star.width).toBe(1)
            expect(star.height).toBe(1)
            expect(star.x).toBeGreaterThanOrEqual(0)
            expect(star.x).toBeLessThan(graphic.width)
            expect(star.y).toBeGreaterThanOrEqual(0)
            expect(star.y).toBeLessThan(graphic.height)
        }
        rectangles.length = 0
        graphic.draw(context as unknown as CanvasRenderingContext2D)
        expect(rectangles).toEqual(firstDraw)
    })

    it('removes previous map stars on replacement and disposes each remaining actor once', () => {
        const { actors, backdrop } = setup()
        backdrop.setMap(map)
        const oldActors = [...actors]
        backdrop.setMap({ ...map, worldWidth: 640, worldHeight: 480 })
        for (const actor of oldActors) expect(actor.kill).toHaveBeenCalledOnce()
        const currentActors = actors.slice(4)
        for (const actor of currentActors) expect(actor.kill).not.toHaveBeenCalled()
        backdrop.dispose()
        backdrop.dispose()
        for (const actor of actors) expect(actor.kill).toHaveBeenCalledOnce()
    })
})
