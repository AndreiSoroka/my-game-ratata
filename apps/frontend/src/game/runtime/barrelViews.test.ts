import type { WorldChestSnapshot } from '@my-game-ratata/contracts'
import type { Engine, ImageSource } from 'excalibur'
import { expect, it, vi } from 'vitest'

import { WorldSceneActors } from './worldSceneActors'

vi.mock('./farmViews', () => ({
    FarmViews: class {
        public update() {}
    },
}))
vi.mock('excalibur', () => ({
    Actor: class {
        public graphics = { use: vi.fn<(graphic: unknown) => void>() }
        public pos = { x: 0, y: 0 }
        public z = 0
    },
    Sprite: class {},
    vec: (x: number, y: number) => ({ x, y }),
}))
it('keeps authored barrel art without drawing a chest on top, both before and after inspection', () => {
    const engine = {
        add: vi.fn<(actor: unknown) => void>(),
        remove: vi.fn<(actor: unknown) => void>(),
    } as unknown as Engine
    const image = {} as ImageSource
    const view = new WorldSceneActors(engine, new Map(), image, image)
    const barrel: WorldChestSnapshot = {
        id: 'barrel',
        kind: 'barrel',
        propId: 'original-barrel',
        position: { x: 100, y: 100 },
        state: 'closed',
        itemCount: 2,
    }
    view.update([], [barrel])
    expect(engine.add).not.toHaveBeenCalled()
    view.update([], [{ ...barrel, state: 'open', itemCount: 0 }])
    expect(engine.add).not.toHaveBeenCalled()
    view.update(
        [],
        [barrel, { id: 'chest', position: { x: 140, y: 100 }, state: 'closed', itemCount: 0 }]
    )
    expect(engine.add).toHaveBeenCalledTimes(1)
})
