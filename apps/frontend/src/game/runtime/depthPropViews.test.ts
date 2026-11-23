import type {
    AdventureResourceNode,
    Vector2,
    WorldGraveSnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import type { Engine } from 'excalibur'
import { describe, expect, it, vi } from 'vitest'

import { DepthPropViews } from './depthPropViews'
import type { HarvestGraphics } from './tiledMap'

interface Graphic {
    options: { width: number; height: number; draw: (context: CanvasRenderingContext2D) => void }
}
interface ViewActor {
    options: { collisionType: string; pos: Vector2; z: number }
    pos: Vector2
    z: number
    graphics: { use: ReturnType<typeof vi.fn<(graphic: Graphic) => void>>; isVisible?: boolean }
    kill: ReturnType<typeof vi.fn<() => void>>
}
vi.mock('excalibur', () => ({
    Actor: class {
        public constructor(public options: ViewActor['options']) {}
        public graphics = { use: vi.fn<(graphic: Graphic) => void>() }
        public kill = vi.fn<() => void>()
    },
    Canvas: class {
        public constructor(public options: Graphic['options']) {}
    },
    CollisionType: { PreventCollision: 'no-collision' },
    vec: (x: number, y: number) => ({ x, y }),
}))
function fixture() {
    const actors: ViewActor[] = []
    const view = new DepthPropViews({
        add: (actor: ViewActor) => actors.push(actor),
    } as unknown as Engine)
    const bitmap = document.createElement('canvas')
    bitmap.width = bitmap.height = 16
    const graphics: HarvestGraphics = {
        forest: bitmap,
        sapling: bitmap,
        stump: bitmap,
        grave: bitmap,
    }
    view.setProps([], graphics)
    return { actors, view, bitmap, graphics }
}
const grave: WorldGraveSnapshot = {
    id: 'grave:person',
    buriedName: 'Мирослав',
    locationId: 'map-2-2',
    position: { x: 120, y: 160 },
    phase: 'active',
    health: { kind: 'exact', current: 100, max: 100 },
    material: 'stone',
}

it('retains omitted resource art, updates its phase on reentry and removes it only inside the view', () => {
    const { actors, view, bitmap, graphics } = fixture()
    view.setProps(
        [{ id: 'authored-tree', bitmap, x: 64, y: 48, baseY: 80, width: 16, height: 16 }],
        graphics
    )
    const original = actors[0]!
    const tree: AdventureResourceNode = {
        id: 'tree',
        propId: 'authored-tree',
        source: 'tree',
        phase: 'ready',
        kind: 'wood',
        remaining: 8,
        locationId: 'map-2-2',
        position: { x: 72, y: 72 },
    }
    const nearby = { left: 32, top: 32, right: 112, bottom: 112 }
    const away = { left: 256, top: 256, right: 512, bottom: 512 }
    view.updateResources([tree])
    view.updateResources([], away)
    expect(original.graphics.isVisible).toBe(true)
    view.updateResources([{ ...tree, phase: 'stump', remaining: 0 }], nearby)
    const stump = actors[1]!
    expect(original.graphics.isVisible).toBe(false)
    view.updateResources([], away)
    expect(stump.kill).not.toHaveBeenCalled()
    view.updateResources([tree], nearby)
    expect(stump.kill).toHaveBeenCalledOnce()
    expect(original.graphics.isVisible).toBe(true)
    view.updateResources([], nearby)
    expect(original.graphics.isVisible).toBe(false)
    view.updateResources([tree], nearby)
    expect(original.graphics.isVisible).toBe(true)
})

it('drops cached resource state on map disposal and retains full-list removal behavior', () => {
    const { actors, view, graphics } = fixture()
    const tree: AdventureResourceNode = {
        id: 'planted',
        source: 'tree',
        phase: 'growing',
        kind: 'wood',
        remaining: 0,
        locationId: 'map-2-2',
        position: { x: 72, y: 72 },
    }
    const away = { left: 256, top: 256, right: 512, bottom: 512 }
    view.updateResources([tree])
    const old = actors[0]!
    view.updateResources([], away)
    expect(old.kill).not.toHaveBeenCalled()
    view.setProps([], graphics)
    expect(old.kill).toHaveBeenCalledOnce()
    view.updateResources([], away)
    expect(actors).toHaveLength(1)
    view.updateResources([tree])
    const current = actors[1]!
    view.updateResources([])
    expect(current.kill).toHaveBeenCalledOnce()
})

it.each(['apple', 'pine'] as const)(
    'renders a %s tree fallback with its own profile art',
    (profile) => {
        const { view, graphics, actors } = fixture()
        const bitmap = document.createElement('canvas')
        bitmap.width = profile === 'pine' ? 16 : 48
        bitmap.height = profile === 'pine' ? 32 : 64
        graphics[profile] = bitmap
        view.updateResources([
            {
                id: 'profile-tree',
                source: 'tree',
                kind: 'wood',
                treeProfile: profile,
                phase: 'ready',
                remaining: 8,
                locationId: 'map-2-2',
                position: { x: 100, y: 100 },
            },
        ])
        const drawImage = vi.fn<(image: HTMLCanvasElement, x: number, y: number) => void>()
        actors[0]?.graphics.use.mock.calls[0]?.[0].options.draw({
            drawImage,
        } as unknown as CanvasRenderingContext2D)
        expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0)
    }
)

it('preserves purified authored graves outside partial views and applies current phases on reentry', () => {
    const { actors, view, bitmap, graphics } = fixture()
    const props = [{ id: 'authored', bitmap, x: 112, y: 146, baseY: 160, width: 16, height: 16 }]
    view.setProps(props, graphics)
    const original = actors[0]!
    const authored = { ...grave, propId: 'authored' }
    const purified: WorldGraveSnapshot = {
        ...authored,
        phase: 'purified',
        health: { kind: 'exact', current: 0, max: 100 },
    }
    const nearby = { left: 96, top: 128, right: 160, bottom: 192 }
    const away = { left: 256, top: 256, right: 512, bottom: 512 }
    view.updateGraves([purified])
    expect(original.graphics.isVisible).toBe(false)
    view.updateGraves([], away)
    view.updateGraves([], away)
    expect(original.graphics.isVisible).toBe(false)
    view.updateGraves([purified], nearby)
    expect(original.graphics.isVisible).toBe(false)
    view.updateGraves([authored], nearby)
    expect(original.graphics.isVisible).toBe(true)
    view.updateGraves([], nearby)
    expect(original.graphics.isVisible).toBe(false)
    view.updateGraves([authored], nearby)
    expect(original.graphics.isVisible).toBe(true)
    view.updateGraves([purified], nearby)
    view.updateGraves([])
    expect(original.graphics.isVisible).toBe(true)
    view.updateGraves([purified])
    view.setProps(props, graphics)
    expect(original.kill).toHaveBeenCalledOnce()
    view.updateGraves([], away)
    expect(actors[1]!.graphics.isVisible).not.toBe(false)
})

describe('dynamic grave presentation', () => {
    it('uses the existing grave atlas bitmap, sorts at ground contact and retains identity after loot disappears', () => {
        const { actors, view, bitmap } = fixture()
        const snapshot: WorldSnapshot = {
            serverTime: 0,
            tick: 1,
            characters: [],
            items: [],
            chests: [{ id: 'corpse', position: grave.position, state: 'closed', itemCount: 1 }],
            graves: [grave],
        }
        view.updateGraves(snapshot.graves ?? [])
        const actor = actors[0]!
        expect(actor.pos).toEqual({ x: 112, y: 146 })
        expect(actor.z).toBe(160)
        expect(actor.options.collisionType).toBe('no-collision')
        const drawImage = vi.fn<CanvasRenderingContext2D['drawImage']>()
        actor.graphics.use.mock.lastCall![0].options.draw({
            drawImage,
        } as unknown as CanvasRenderingContext2D)
        expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0)
        snapshot.chests = []
        view.updateResources([])
        view.updateGraves(structuredClone(snapshot.graves ?? []))
        expect(actors).toHaveLength(1)
        expect(actor.kill).not.toHaveBeenCalled()
        expect(actor.graphics.use).toHaveBeenCalledOnce()
    })
    it('removes absent markers and disposes old map content without resurrecting it before atlas load', () => {
        const { actors, view, graphics } = fixture()
        view.updateGraves([grave])
        const first = actors[0]!
        view.updateGraves([])
        expect(first.kill).toHaveBeenCalledOnce()
        view.updateGraves([grave])
        const second = actors[1]!
        view.setProps([])
        expect(second.kill).toHaveBeenCalledOnce()
        view.updateGraves([grave])
        expect(actors).toHaveLength(2)
        view.setProps([], graphics)
        view.updateGraves([grave])
        const third = actors[2]!
        view.dispose()
        view.dispose()
        view.updateGraves([grave])
        expect(third.kill).toHaveBeenCalledOnce()
        expect(actors).toHaveLength(3)
    })
    it('replaces an authored grave with noncolliding rubble, restores its original art and permanently hides purification', () => {
        const { actors, view, bitmap, graphics } = fixture()
        view.setProps(
            [{ id: 'authored', bitmap, x: 112, y: 146, baseY: 160, width: 16, height: 16 }],
            graphics
        )
        const original = actors[0]!
        const authored = { ...grave, propId: 'authored' }
        view.updateGraves([authored])
        expect(actors).toHaveLength(1)
        view.updateGraves([
            {
                ...authored,
                phase: 'ruined',
                health: { kind: 'exact', current: 0, max: 100 },
                restoresAt: 1_800_000,
            },
        ])
        const rubble = actors[1]!
        expect(original.graphics.isVisible).toBe(false)
        expect(rubble.options.collisionType).toBe('no-collision')
        expect(rubble.pos).toEqual({ x: 112, y: 146 })
        const fillRect = vi.fn<CanvasRenderingContext2D['fillRect']>()
        rubble.graphics.use.mock.lastCall![0].options.draw({
            fillRect,
        } as unknown as CanvasRenderingContext2D)
        expect(fillRect).toHaveBeenCalled()
        view.updateGraves([authored])
        expect(original.graphics.isVisible).toBe(true)
        expect(rubble.kill).toHaveBeenCalledOnce()
        view.updateGraves([
            { ...authored, phase: 'purified', health: { kind: 'exact', current: 0, max: 100 } },
        ])
        expect(original.graphics.isVisible).toBe(false)
        expect(actors).toHaveLength(2)
        view.updateGraves([
            { ...authored, phase: 'purified', health: { kind: 'exact', current: 0, max: 100 } },
        ])
        expect(original.graphics.isVisible).toBe(false)
        view.setProps([], graphics)
        expect(original.kill).toHaveBeenCalledOnce()
        view.updateGraves([])
        expect(actors).toHaveLength(2)
    })
})
