import type { Vector2, WorldGraveSnapshot, WorldSnapshot } from '@my-game-ratata/contracts'
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
    locationId: 'map-2-2',
    position: { x: 120, y: 160 },
    phase: 'active',
    hp: 100,
    maxHp: 100,
    material: 'stone',
}

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
        view.updateGraves([{ ...authored, phase: 'ruined', hp: 0, restoresAt: 1_800_000 }])
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
        view.updateGraves([{ ...authored, phase: 'purified', hp: 0 }])
        expect(original.graphics.isVisible).toBe(false)
        expect(actors).toHaveLength(2)
        view.updateGraves([{ ...authored, phase: 'purified', hp: 0 }])
        expect(original.graphics.isVisible).toBe(false)
        view.setProps([], graphics)
        expect(original.kill).toHaveBeenCalledOnce()
        view.updateGraves([])
        expect(actors).toHaveLength(2)
    })
})
