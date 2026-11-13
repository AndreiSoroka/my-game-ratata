import type { CharacterSnapshot, WorldObjectSnapshot } from '@my-game-ratata/contracts'
import type { Engine } from 'excalibur'
import { describe, expect, it, vi } from 'vitest'

import { SignReadingViews } from './signReadingViews'

interface LabelView {
    graphics: { isVisible: boolean; use: ReturnType<typeof vi.fn> }
    kill: ReturnType<typeof vi.fn>
}
vi.mock('excalibur', () => ({
    Actor: class {
        public graphics = { isVisible: true, use: vi.fn<(graphic: unknown) => void>() }
        public kill = vi.fn<() => void>()
    },
    Canvas: class {
        public constructor(public options: { draw: (context: CanvasRenderingContext2D) => void }) {}
    },
    vec: (x: number, y: number) => ({ x, y }),
}))

function setup() {
    const labels: LabelView[] = []
    const views = new SignReadingViews({
        add: (label: LabelView) => labels.push(label),
    } as unknown as Engine)
    const visibility = {
        width: 12,
        height: 12,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array.from({ length: 144 }, () => false),
    }
    views.setMap(visibility)
    const sign: WorldObjectSnapshot = {
        id: 'guild',
        kind: 'sign',
        name: 'Гильдия искателей',
        position: { x: 104, y: 104 },
        bounds: { x: 96, y: 96, width: 16, height: 16 },
        depleted: false,
    }
    const player = {
        alive: true,
        facing: 'right',
        position: { x: 80, y: 104 },
        tags: [],
    } as unknown as CharacterSnapshot
    return { views, label: labels[0]!, visibility, sign, player }
}

describe('sign reading presentation lifetime', () => {
    it('caches legible light glyphs over a compact dark background without a covering stroke', () => {
        const { views, label, sign, player } = setup()
        views.update([sign], player, () => true)
        views.update([sign], player, () => true)
        expect(label.graphics.use).toHaveBeenCalledTimes(1)
        const graphic = label.graphics.use.mock.calls[0]![0] as {
            options: { cache: boolean; draw: (context: CanvasRenderingContext2D) => void }
        }
        const draws: { kind: string; color: string; text?: string }[] = []
        const context = {
            fillStyle: '',
            measureText: () => ({ width: 70 }),
            fillRect: () => draws.push({ kind: 'background', color: context.fillStyle }),
            fillText: (text: string) =>
                draws.push({ kind: 'text', color: context.fillStyle, text }),
            strokeText: vi.fn<() => void>(),
        }
        graphic.options.draw(context as unknown as CanvasRenderingContext2D)
        expect(graphic.options.cache).toBe(true)
        expect(draws).toEqual([
            { kind: 'background', color: '#172318' },
            { kind: 'text', color: '#fff0c5', text: sign.name },
        ])
        expect(context.strokeText).not.toHaveBeenCalled()
    })
    it('shows only a nearby name and removes it as soon as the player leaves or disappears', () => {
        const { views, label, sign, player } = setup()
        views.update([sign], player, () => true)
        expect(label.graphics.isVisible).toBe(true)
        player.position.x = 20
        views.update([sign], player, () => true)
        expect(label.graphics.isVisible).toBe(false)
        player.position.x = 80
        views.update([sign], player, () => true)
        views.update([sign], undefined, () => true)
        expect(label.graphics.isVisible).toBe(false)
    })
    it('clears the old map hint immediately and removes the actor on disposal', () => {
        const { views, label, visibility, sign, player } = setup()
        views.update([sign], player, () => true)
        views.setMap(visibility)
        expect(label.graphics.isVisible).toBe(false)
        views.update([sign], player, () => true)
        views.dispose()
        expect(label.graphics.isVisible).toBe(false)
        expect(label.kill).toHaveBeenCalledOnce()
    })
})
