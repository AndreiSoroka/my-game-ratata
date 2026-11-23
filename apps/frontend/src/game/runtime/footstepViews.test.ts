import type { Vector2 } from '@my-game-ratata/contracts'
import type { Engine, ImageSource } from 'excalibur'
import { expect, it, vi } from 'vitest'

import { FootstepViews } from './footstepViews'

vi.mock('excalibur', () => ({
    Actor: class {
        public graphics = { opacity: 1, use: vi.fn<(graphic: unknown) => void>() }
        public kill = vi.fn<() => void>()
        public constructor(public options: { pos: Vector2 }) {}
    },
    Canvas: class {},
    CollisionType: { PreventCollision: 'prevent' },
    GraphicsGroup: class {},
    vec: (x: number, y: number) => ({ x, y }),
}))

interface ViewActor {
    options: { pos: Vector2 }
    graphics: { opacity: number }
    kill: ReturnType<typeof vi.fn<() => void>>
}

it('draws the last heard position once and expires it between snapshots', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(100)
    const add = vi.fn<(actor: ViewActor) => void>()
    const on = vi.fn<(event: string, callback: () => void) => void>()
    const off = vi.fn<(event: string, callback: () => void) => void>()
    const toSprite = vi.fn<() => unknown>()
    const views = new FootstepViews(
        { add, on, off } as unknown as Engine,
        { toSprite } as unknown as ImageSource
    )
    try {
        const position = { x: 40, y: 80 }
        const step = { id: 1, position, expiresAt: 1_900 }
        const snapshot = { heardFootsteps: [step], serverTime: 1_000 }
        views.sync(snapshot, true, 1_200)
        views.sync(snapshot, true, 1_200)
        expect(add).toHaveBeenCalledOnce()
        expect(views.ids()).toEqual([step.id])
        const [actor] = add.mock.calls[0]!
        const update = on.mock.calls[0]![1]
        expect(actor.options.pos).toEqual(position)
        expect(actor.graphics.opacity).toBe(1)

        clock.mockReturnValue(880)
        update()
        expect(actor.graphics.opacity).toBe(0.5)
        expect(actor.options.pos).toEqual(position)

        clock.mockReturnValue(1000)
        update()
        expect(actor.kill).toHaveBeenCalledOnce()
        expect(views.ids()).toEqual([])

        const next = {
            heardFootsteps: [step, { ...step, id: 2, expiresAt: 2_700 }],
            serverTime: 1_900,
        }
        views.sync(next, true, 1_200)
        expect(views.ids()).toEqual([2])
        views.dispose()
        expect(add.mock.calls[1]![0].kill).toHaveBeenCalledOnce()
        expect(views.ids()).toEqual([])
        expect(off).toHaveBeenCalledWith('postupdate', update)
    } finally {
        clock.mockRestore()
    }
})
