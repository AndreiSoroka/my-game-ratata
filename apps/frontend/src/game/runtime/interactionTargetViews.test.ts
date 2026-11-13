import type { Vector2 } from '@my-game-ratata/contracts'
import type { Engine } from 'excalibur'
import { describe, expect, it, vi } from 'vitest'

import { InteractionTargetViews, type TargetHighlight } from './interactionTargetViews'

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
    const view = new InteractionTargetViews({
        add: (actor: ViewActor) => actors.push(actor),
    } as unknown as Engine)
    return { view, ground: actors[0]!, frame: actors[1]! }
}
const character: TargetHighlight = {
    key: 'character:lea',
    kind: 'character',
    position: { x: 100, y: 200 },
}

describe('exact selected interaction target presentation', () => {
    it('follows the supplied moving character and reuses cached graphics without touching the target', () => {
        const { view, ground, frame } = setup()
        expect(frame.graphics.isVisible).toBe(false)
        const target = Object.freeze({
            ...character,
            position: Object.freeze({ ...character.position }),
        })
        view.set(target)
        expect(frame.pos).toEqual({ x: 85, y: 168 })
        expect(ground.pos).toEqual({ x: 100, y: 201 })
        expect(ground.z).toBeLessThan(200)
        expect(frame.z).toBeGreaterThan(200)
        view.set({ ...character, position: { x: 120, y: 220 } })
        expect(frame.pos).toEqual({ x: 105, y: 188 })
        expect(ground.pos).toEqual({ x: 120, y: 221 })
        expect(frame.graphics.use).toHaveBeenCalledTimes(1)
        expect(ground.graphics.use).toHaveBeenCalledTimes(1)
        expect(target.position).toEqual({ x: 100, y: 200 })
    })
    it('uses authored object bounds and resizes only when geometry changes', () => {
        const { view, ground, frame } = setup()
        const target: TargetHighlight = {
            key: 'world:trough',
            kind: 'object',
            position: { x: 316, y: 408 },
            bounds: { x: 300, y: 400, width: 32, height: 16 },
        }
        view.set(target)
        expect(frame.pos).toEqual({ x: 297, y: 397 })
        expect(ground.pos).toEqual({ x: 316, y: 415 })
        const graphic = frame.graphics.use.mock.calls[0]![0]
        expect(graphic.options).toMatchObject({ width: 38, height: 22, cache: true })
        view.set({ ...target, key: 'world:other-trough' })
        expect(frame.graphics.use).toHaveBeenCalledTimes(1)
        view.set({ key: 'item:food', position: { x: 100, y: 100 } })
        expect(frame.pos).toEqual({ x: 89, y: 89 })
        expect(frame.graphics.use).toHaveBeenCalledTimes(2)
    })
    it('removes both markers immediately on cleared selection and cannot reappear after disposal', () => {
        const { view, ground, frame } = setup()
        view.set(character)
        expect(frame.graphics.isVisible && ground.graphics.isVisible).toBe(true)
        view.set(undefined)
        expect(frame.graphics.isVisible || ground.graphics.isVisible).toBe(false)
        view.set(character)
        view.clear()
        expect(frame.graphics.isVisible || ground.graphics.isVisible).toBe(false)
        view.set(character)
        view.dispose()
        view.dispose()
        view.set(character)
        expect(frame.graphics.isVisible || ground.graphics.isVisible).toBe(false)
        expect(frame.kill).toHaveBeenCalledOnce()
        expect(ground.kill).toHaveBeenCalledOnce()
    })
    it('draws four outlined gold corners and a separate translucent ground ring', () => {
        const { view, frame, ground } = setup()
        view.set(character)
        const strokes: { color: string; width: number }[] = []
        const context = {
            strokeStyle: '',
            lineWidth: 0,
            fillStyle: '',
            beginPath: vi.fn<() => void>(),
            moveTo: vi.fn<(x: number, y: number) => void>(),
            lineTo: vi.fn<(x: number, y: number) => void>(),
            strokeRect: vi.fn<() => void>(),
            ellipse: vi.fn<() => void>(),
            fill: vi.fn<() => void>(),
            stroke: () => strokes.push({ color: context.strokeStyle, width: context.lineWidth }),
        }
        frame.graphics.use.mock.calls[0]![0].options.draw(
            context as unknown as CanvasRenderingContext2D
        )
        expect(context.moveTo).toHaveBeenCalledTimes(4)
        expect(context.lineTo).toHaveBeenCalledTimes(8)
        expect(strokes).toEqual([
            { color: '#26301ddd', width: 3 },
            { color: '#ffe295', width: 1 },
        ])
        ground.graphics.use.mock.calls[0]![0].options.draw(
            context as unknown as CanvasRenderingContext2D
        )
        expect(context.ellipse).toHaveBeenCalledOnce()
        expect(context.fill).toHaveBeenCalledOnce()
        expect(context.fillStyle).toBe('#ffd97922')
    })
})
