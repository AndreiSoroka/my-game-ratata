import type { Actor, Camera, Engine } from 'excalibur'
import { describe, expect, it, vi } from 'vitest'

import { SceneMapView } from './sceneMapActor'
import type { RenderedTiledMap } from './tiledMap'

vi.mock('excalibur', () => ({
    Actor: class {
        public graphics = { use: vi.fn<() => void>() }
        public kill = vi.fn<() => void>()
    },
    Canvas: class {},
    Color: { fromHex: (hex: string) => hex },
    vec: (x: number, y: number) => ({ x, y }),
}))

const map = {
    worldWidth: 1536,
    worldHeight: 1280,
    tileWidth: 16,
    tileHeight: 16,
} as RenderedTiledMap

describe('scene map lifecycle', () => {
    it('replaces map actors and camera limits even when following the same character after travel', () => {
        const actors: { kill: ReturnType<typeof vi.fn<() => void>> }[] = []
        const camera = {
            clearAllStrategies: vi.fn<() => void>(),
            strategy: { lockToActor: vi.fn<(actor: Actor) => void>() },
            addStrategy: vi.fn<Camera['addStrategy']>(),
            zoom: 1,
        }
        const view = new SceneMapView({
            currentScene: { camera },
            add: (actor: (typeof actors)[number]) => actors.push(actor),
        } as unknown as Engine)
        const player = {} as Actor
        view.setMap(map)
        view.follow(player)
        view.follow(player)
        expect(camera.zoom).toBe(3)
        expect(camera.clearAllStrategies).toHaveBeenCalledOnce()
        expect(camera.strategy.lockToActor).toHaveBeenCalledExactlyOnceWith(player)
        expect(camera.addStrategy.mock.calls[0]![0]!.target).toEqual({
            left: -96,
            top: -96,
            right: 1632,
            bottom: 1376,
        })

        const oldActors = [...actors]
        view.setMap({ ...map, worldWidth: 640, worldHeight: 480 })
        for (const actor of oldActors) expect(actor.kill).toHaveBeenCalledOnce()
        view.follow(player)
        expect(camera.clearAllStrategies).toHaveBeenCalledTimes(2)
        expect(camera.strategy.lockToActor).toHaveBeenCalledTimes(2)
        expect(camera.addStrategy.mock.calls[1]![0]!.target).toEqual({
            left: -96,
            top: -96,
            right: 736,
            bottom: 576,
        })

        view.dispose()
        view.dispose()
        for (const actor of actors) expect(actor.kill).toHaveBeenCalledOnce()
    })
})
