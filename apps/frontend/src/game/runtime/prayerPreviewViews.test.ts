import type { Vector2 } from '@my-game-ratata/contracts'
import type { Engine } from 'excalibur'
import { expect, it, vi } from 'vitest'

import type { PrayerPreviewHighlight } from './prayerPreviewPresentation'
import { PrayerPreviewViews } from './prayerPreviewViews'

interface Graphic {
    options: {
        width: number
        height: number
        cache: boolean
        draw: (context: CanvasRenderingContext2D) => void
    }
}
interface ViewActor {
    pos: Vector2
    z: number
    graphics: { isVisible: boolean; use: ReturnType<typeof vi.fn<(graphic: Graphic) => void>> }
    kill: ReturnType<typeof vi.fn<() => void>>
}
vi.mock('excalibur', () => ({
    Actor: class {
        public graphics = { isVisible: true, use: vi.fn<(graphic: Graphic) => void>() }
        public kill = vi.fn<() => void>()
    },
    Canvas: class {
        public constructor(public options: Graphic['options']) {}
    },
    vec: (x: number, y: number) => ({ x, y }),
}))
function setup() {
    const actors: ViewActor[] = []
    const view = new PrayerPreviewViews({
        add: (actor: ViewActor) => actors.push(actor),
    } as unknown as Engine)
    return { view, actors, ring: actors[0]! }
}
const preview: PrayerPreviewHighlight = {
    origin: { x: 100, y: 200 },
    radius: 48,
    targetId: 'chosen',
    warnings: [{ id: 'ally', position: { x: 120, y: 200 }, self: false }],
}

it('draws a real 48px world radius and reuses static geometry as the caster moves', () => {
    const { view, ring, actors } = setup()
    view.set(preview)
    expect(ring.pos).toEqual(preview.origin)
    expect(ring.z).toBeLessThan(preview.origin.y)
    const graphic = ring.graphics.use.mock.calls[0]![0]
    expect(graphic.options).toMatchObject({ width: 100, height: 100, cache: true })
    const context = {
        beginPath: vi.fn<CanvasRenderingContext2D['beginPath']>(),
        arc: vi.fn<CanvasRenderingContext2D['arc']>(),
        fill: vi.fn<CanvasRenderingContext2D['fill']>(),
        stroke: vi.fn<CanvasRenderingContext2D['stroke']>(),
        setLineDash: vi.fn<CanvasRenderingContext2D['setLineDash']>(),
    }
    graphic.options.draw(context as unknown as CanvasRenderingContext2D)
    expect(context.arc).toHaveBeenCalledWith(50, 50, 48, 0, Math.PI * 2)
    expect(context.setLineDash).toHaveBeenLastCalledWith([])
    view.set({ ...preview, origin: { x: 140, y: 210 } })
    expect(ring.graphics.use).toHaveBeenCalledOnce()
    expect(actors).toHaveLength(2)
    expect(actors[1]!.pos).toEqual({ x: 120, y: 166 })
})

it('removes disappeared warning actors and clears all geometry on blocked state or disposal', () => {
    const { view, ring, actors } = setup()
    view.set(preview)
    const warning = actors[1]!
    view.set({ ...preview, warnings: [] })
    expect(warning.kill).toHaveBeenCalledOnce()
    view.set(undefined)
    expect(ring.graphics.isVisible).toBe(false)
    view.set(preview)
    const second = actors[2]!
    view.dispose()
    view.dispose()
    view.set(preview)
    expect(second.kill).toHaveBeenCalledOnce()
    expect(ring.kill).toHaveBeenCalledOnce()
    expect(ring.graphics.isVisible).toBe(false)
    expect(actors).toHaveLength(3)
})
