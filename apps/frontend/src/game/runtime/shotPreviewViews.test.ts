import { forwardAbilityAttack, forwardShot } from '@my-game-ratata/contracts'
import type { Engine } from 'excalibur'
import { expect, it, vi } from 'vitest'

import { ShotPreviewViews } from './shotPreviewViews'

const rendered = vi.hoisted(() => ({
    canvases: [] as {
        width: number
        height: number
        draw: (context: CanvasRenderingContext2D) => void
    }[],
}))
vi.mock('excalibur', () => ({
    Actor: class {
        public graphics = { use: vi.fn<(value: unknown) => void>(), isVisible: true }
        public kill = vi.fn<() => void>()
    },
    Canvas: class {
        public constructor(options: (typeof rendered.canvases)[number]) {
            rendered.canvases.push(options)
        }
    },
    vec: (x: number, y: number) => ({ x, y }),
}))

it('renders the actual ability width/range and reuses aim graphics across fractional movement', () => {
    rendered.canvases = []
    const actors: { graphics: { isVisible: boolean }; kill: () => void }[] = []
    const engine = {
        add: (actor: (typeof actors)[number]) => actors.push(actor),
    } as unknown as Engine
    const views = new ShotPreviewViews(engine)
    views.set(forwardShot({ x: 100, y: 100 }, 'right'))
    views.set(forwardAbilityAttack({ x: 100, y: 100 }, 'right', 'spark'))
    for (let step = 1; step <= 100; step++)
        views.set(forwardAbilityAttack({ x: 100 + step / 17, y: 100 }, 'right', 'spark'))
    expect(rendered.canvases).toHaveLength(2)
    const strokeRect = vi.fn<(x: number, y: number, width: number, height: number) => void>()
    const context = {
        strokeRect,
        setLineDash: () => undefined,
        beginPath: () => undefined,
        moveTo: () => undefined,
        lineTo: () => undefined,
        stroke: () => undefined,
    } as unknown as CanvasRenderingContext2D
    rendered.canvases[0]!.draw(context)
    rendered.canvases[1]!.draw(context)
    expect(strokeRect.mock.calls).toEqual([
        [1, 2, 64, 22.4],
        [1, 2, 80, 32],
    ])
    expect(actors[0]?.graphics.isVisible).toBe(true)
    views.clear()
    expect(actors[0]?.graphics.isVisible).toBe(false)
    views.dispose()
    expect(actors[0]?.kill).toHaveBeenCalledOnce()
})
