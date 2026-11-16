import type { CharacterRouteSnapshot, Vector2 } from '@my-game-ratata/contracts'
import type { Engine } from 'excalibur'
import { expect, it, vi } from 'vitest'

import { routeFixture } from '../testing/automationFixture'
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

it('adds a non-color warning only to the active blocked point and clears it on resumed progress', () => {
    const actors: ViewActor[] = []
    const views = new RouteWaypointViews({
        add: (actor: ViewActor) => actors.push(actor),
    } as unknown as Engine)
    const route = routeFixture()
    const saved = [
        { id: 'home', number: 1, name: 'Home', locationId: 'map-2-2', position: { x: 90, y: 100 } },
    ]
    views.update(route, saved, route.locationId, () => true)
    expect(drawMarker(actors[0]).mock.calls.map((call) => call[0])).toEqual(['4', '!'])
    expect(drawMarker(actors[1]).mock.calls.map((call) => call[0])).toEqual(['5'])
    expect(drawMarker(actors[2]).mock.calls.map((call) => call[0])).toEqual(['N1'])
    route.waiting = null
    views.update(route, saved, route.locationId, () => true)
    expect(drawMarker(actors[0]).mock.calls.map((call) => call[0])).toEqual(['4'])
    route.points.shift()
    views.update(route, saved, route.locationId, () => true)
    expect(actors[0]?.kill).toHaveBeenCalledOnce()
    views.dispose()
})

function drawMarker(actor: ViewActor | undefined) {
    const graphic = actor?.graphics.use.mock.calls.at(-1)?.[0] as {
        options: { draw: (context: CanvasRenderingContext2D) => void }
    }
    const fillText = vi.fn<(text: string, x: number, y: number) => void>()
    graphic.options.draw({
        beginPath: vi.fn<CanvasRenderingContext2D['beginPath']>(),
        arc: vi.fn<CanvasRenderingContext2D['arc']>(),
        fill: vi.fn<CanvasRenderingContext2D['fill']>(),
        stroke: vi.fn<CanvasRenderingContext2D['stroke']>(),
        moveTo: vi.fn<CanvasRenderingContext2D['moveTo']>(),
        lineTo: vi.fn<CanvasRenderingContext2D['lineTo']>(),
        fillText,
    } as unknown as CanvasRenderingContext2D)
    return fillText
}
