import type { Engine } from 'excalibur'
import { describe, expect, it, vi } from 'vitest'

import { BuildingViews } from './buildingViews'
import { containsPosition, type MapBuilding } from './mapBuildings'

interface ViewActor {
    z: number
    text?: string
    graphics: { isVisible: boolean }
    kill: ReturnType<typeof vi.fn<() => void>>
}
vi.mock('excalibur', () => {
    class Actor {
        public z: number
        public graphics = { isVisible: true, use: vi.fn<(graphic: unknown) => void>() }
        public kill = vi.fn<() => void>()
        public constructor(options: { z: number }) {
            this.z = options.z
        }
    }
    return {
        Actor,
        Canvas: class {},
        Color: { fromHex: (color: string) => color },
        Font: class {},
        Label: class extends Actor {
            public text = 'Вход'
        },
        vec: (x: number, y: number) => ({ x, y }),
    }
})
function setup() {
    const actors: ViewActor[] = []
    const engine = { add: (actor: ViewActor) => actors.push(actor) } as unknown as Engine
    const building: MapBuilding = {
        id: 'inn',
        name: 'Inn',
        x: 32,
        y: 48,
        width: 64,
        height: 80,
        entry: { x: 64, y: 120 },
        cover: document.createElement('canvas'),
    }
    const views = new BuildingViews(engine)
    views.setBuildings([building])
    return { actors, building, views }
}

describe('building front depth and roof visibility', () => {
    it('keeps a player just outside the front edge above the facade instead of hiding their head', () => {
        const { actors, building, views } = setup()
        const roof = actors[0]!
        const front = { x: 64, y: 128 }
        expect(containsPosition(building, front)).toBe(false)
        views.update(front)
        expect(roof.graphics.isVisible).toBe(true)
        expect(roof.z).toBeLessThan(front.y)
        const behind = { x: 64, y: 47 }
        views.update(behind)
        expect(roof.z).toBeGreaterThan(behind.y)
    })
    it('hides an entered roof and its contents from outside, and restores the roof on exit', () => {
        const { actors, views } = setup()
        const roof = actors[0]!
        const inside = { x: 64, y: 127 }
        views.update({ x: 64, y: 129 })
        expect(views.hidesCharacter(inside)).toBe(true)
        views.update(inside)
        expect(roof.graphics.isVisible).toBe(false)
        expect(views.hidesCharacter(inside)).toBe(false)
        expect(actors[1]?.text).toBe('Выход')
        views.update({ x: 64, y: 128 })
        expect(roof.graphics.isVisible).toBe(true)
        expect(actors[1]?.text).toBe('Вход')
    })
    it('removes every old cover and entry hint when changing maps', () => {
        const { actors, views } = setup()
        views.setBuildings([])
        expect(actors.every((actor) => actor.kill.mock.calls.length === 1)).toBe(true)
    })
})
