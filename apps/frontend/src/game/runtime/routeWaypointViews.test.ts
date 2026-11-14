import type { CharacterRouteSnapshot, Vector2 } from '@my-game-ratata/contracts'
import type { Engine } from 'excalibur'
import { expect, it, vi } from 'vitest'

import { RouteWaypointViews } from './routeWaypointViews'

interface ViewActor {
    pos: Vector2
    graphics: { isVisible: boolean; use: ReturnType<typeof vi.fn> }
    kill: ReturnType<typeof vi.fn>
}
vi.mock('excalibur', () => ({
    Actor: class {
        public graphics = { isVisible: true, use: vi.fn<(graphic: unknown) => void>() }
        public kill = vi.fn<() => void>()
    },
    Canvas: class {
        public constructor(public options: unknown) {}
    },
    vec: (x: number, y: number) => ({ x, y }),
}))

it('reconciles stable route numbers and saved map markers, then disposes all views', () => {
    const actors: ViewActor[] = []
    const views = new RouteWaypointViews({
        add: (actor: ViewActor) => actors.push(actor),
    } as unknown as Engine)
    const route: CharacterRouteSnapshot = {
        locationId: 'map-2-2',
        waiting: null,
        points: [
            { number: 1, position: { x: 50, y: 60 } },
            { number: 2, position: { x: 70, y: 80 } },
        ],
    }
    const saved = [
        { id: 'home', number: 1, name: 'Home', locationId: 'map-2-2', position: { x: 90, y: 100 } },
    ]
    views.update(route, saved, 'map-2-2', () => true)
    expect(actors).toHaveLength(3)
    expect(actors[0]?.pos).toEqual({ x: 50, y: 60 })
    route.points.shift()
    views.update(route, saved, 'map-2-2', () => false)
    expect(actors).toHaveLength(3)
    expect(actors[0]?.kill).toHaveBeenCalledOnce()
    expect(actors[1]?.graphics.isVisible).toBe(false)
    views.update(route, saved, 'map-1-2', () => true)
    expect(actors[1]?.kill).toHaveBeenCalledOnce()
    expect(actors[2]?.kill).toHaveBeenCalledOnce()
    views.dispose()
    views.update(route, saved, 'map-2-2', () => true)
    expect(actors).toHaveLength(3)
})
