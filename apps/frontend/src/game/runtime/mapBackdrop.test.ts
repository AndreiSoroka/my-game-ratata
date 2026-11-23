import type { Engine, ExcaliburGraphicsContext } from 'excalibur'
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
    graphics: {
        use: ReturnType<typeof vi.fn<(graphic: { options: GraphicOptions }) => void>>
        onPostDraw: (context: ExcaliburGraphicsContext) => void
    }
    kill: ReturnType<typeof vi.fn<() => void>>
}

interface StarPixel {
    x: number
    y: number
    width: number
    height: number
    color: string
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
    Color: { fromHex: (hex: string) => hex },
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
    const camera = { drawPos: { x: map.worldWidth / 2, y: map.worldHeight / 2 } }
    const backdrop = new MapBackdrop({
        currentScene: { camera },
        add: (actor: ViewActor) => actors.push(actor),
    } as unknown as Engine)
    return { actors, backdrop, camera }
}

function drawStars(actor: ViewActor): StarPixel[] {
    const stars: StarPixel[] = []
    const context = {
        drawRectangle: (
            { x, y }: { x: number; y: number },
            width: number,
            height: number,
            color: string
        ) => stars.push({ x, y, width, height, color }),
    }
    actor.graphics.onPostDraw(context as unknown as ExcaliburGraphicsContext)
    return stars
}

describe('map void backdrop', () => {
    it('keeps cached black strips outside the physical map and below its graphics', () => {
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

    it('draws sparse pixel stars on black without changing them at rest', () => {
        const { actors, backdrop } = setup()
        backdrop.setMap(map)
        const graphic = actors[0]!.graphics.use.mock.calls[0]![0].options
        const fillRect = vi.fn<CanvasRenderingContext2D['fillRect']>()
        const context = {
            fillStyle: '',
            fillRect,
        }
        graphic.draw(context as unknown as CanvasRenderingContext2D)
        expect(context.fillStyle).toBe('#000000')
        expect(fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, graphic.width, graphic.height)
        const stars = drawStars(actors[0]!)
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
        expect(drawStars(actors[0]!)).toEqual(stars)
        backdrop.setMap(map)
        expect(drawStars(actors[4]!)).toEqual(stars)
    })

    it('moves five layers at 64–88% of the camera scroll in both axes', () => {
        const { actors, backdrop, camera } = setup()
        backdrop.setMap(map)
        const top = actors[0]!
        const before = drawStars(top)
        camera.drawPos.x += 100
        camera.drawPos.y += 100
        const after = drawStars(top)
        // Offsets below are in the strip's coordinates before the camera subtracts its 100px.
        for (const offset of [12, 18, 24, 30, 36]) {
            expect(
                before.some((star) =>
                    after.some(
                        (point) =>
                            point.x - star.x === offset &&
                            point.y - star.y === offset &&
                            point.color === star.color
                    )
                )
            ).toBe(true)
        }
        expect(after).not.toEqual(before)
        expect(drawStars(top)).toEqual(after)
    })

    it('fills and clips all strips even after large diagonal camera motion', () => {
        const { actors, backdrop, camera } = setup()
        backdrop.setMap(map)
        for (const x of [-90.5, map.worldWidth + 90.5]) {
            for (const y of [-90.5, map.worldHeight + 90.5]) {
                camera.drawPos = { x, y }
                for (const actor of actors) {
                    const stars = drawStars(actor)
                    expect(stars.length).toBeGreaterThan(10)
                    for (const star of stars) {
                        expect(star.x).toBeGreaterThanOrEqual(0)
                        expect(star.y).toBeGreaterThanOrEqual(0)
                        expect(star.x + star.width).toBeLessThanOrEqual(actor.options.width)
                        expect(star.y + star.height).toBeLessThanOrEqual(actor.options.height)
                    }
                }
            }
        }
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
