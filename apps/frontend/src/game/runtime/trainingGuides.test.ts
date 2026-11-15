import type { TrainingAreaDefinition } from '@my-game-ratata/contracts'
import type { Engine } from 'excalibur'
import { expect, it, vi } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import { observerTrainingArea, TrainingGuides, trainingPrayerHighlight } from './trainingGuides'

const rendered = vi.hoisted(() => ({
    draw: undefined as ((ctx: CanvasRenderingContext2D) => void) | undefined,
    dimensions: [] as number[][],
}))
vi.mock('excalibur', () => ({
    Actor: class {
        public graphics = { isVisible: true, use: vi.fn<(graphic: unknown) => void>() }
        public kill = vi.fn<() => void>()
    },
    Canvas: class {
        public constructor(options: {
            width: number
            height: number
            draw: (ctx: CanvasRenderingContext2D) => void
        }) {
            rendered.draw = options.draw
            rendered.dimensions.push([options.width, options.height])
        }
    },
    vec: (x: number, y: number) => ({ x, y }),
}))
const area: TrainingAreaDefinition = {
    id: 'yard',
    locationId: 'map-2-2',
    bounds: { x: 100, y: 100, width: 208, height: 192 },
}
it('uses learned server prayer radius without a target, mana, harm or ready cooldown', () => {
    const player = characterFixture('priest', {
        abilities: {
            known: ['pray'],
            cooldowns: { pray: 999 },
            barrier: null,
            casting: null,
            prayer: { radius: 80, durationMs: 2700, manaCost: 5, area: false, harm: false },
        },
    })
    player.resourceChecks!.prayers.pray.restore = 'mana'
    expect(trainingPrayerHighlight(player)).toEqual({
        abilityId: 'pray',
        origin: { x: 0, y: 0 },
        radius: 80,
        warnings: [],
    })
    expect(trainingPrayerHighlight({ ...player, alive: false })).toBeUndefined()
    expect(trainingPrayerHighlight(characterFixture('warrior'))).toBeUndefined()
})
it('requires a living connected observer inside the authored rectangle', () => {
    const player = characterFixture('hero', { position: { x: 101, y: 101 } })
    expect(observerTrainingArea([area], player)).toBe(area)
    for (const overrides of [
        { alive: false },
        { connected: false },
        { position: { x: 308, y: 101 } },
        { tags: ['offline'] },
    ]) {
        expect(observerTrainingArea([area], { ...player, ...overrides })).toBeUndefined()
    }
})
it('clips attack, shot and prayer hints; ignores outside and hidden attackers; clears on exit', () => {
    const canvas = { dataset: {} as Record<string, string> }
    const guides = new TrainingGuides({
        add: vi.fn<(actor: unknown) => void>(),
        canvas,
    } as unknown as Engine)
    const zone = { ownerId: 'inside', minX: 90, minY: 110, maxX: 400, maxY: 140 }
    const fighter = characterFixture('inside', {
        position: { x: 120, y: 120 },
        attackZones: [zone],
    })
    guides.update(
        area,
        [
            fighter,
            { ...fighter, id: 'hidden' },
            { ...fighter, id: 'outside', position: { x: 90, y: 120 } },
        ],
        (id) => id !== 'hidden'
    )
    guides.setShot({ origin: fighter.position, endpoint: { x: 400, y: 120 } })
    guides.setPrayer({ origin: fighter.position, radius: 48, warnings: [] })
    const ctx = Object.fromEntries(
        [
            'save',
            'restore',
            'beginPath',
            'rect',
            'clip',
            'translate',
            'rotate',
            'fillRect',
            'setLineDash',
            'strokeRect',
            'moveTo',
            'lineTo',
            'stroke',
            'arc',
            'fill',
        ].map((name) => [name, vi.fn<(...args: unknown[]) => void>()])
    )
    rendered.draw!(ctx as unknown as CanvasRenderingContext2D)
    expect(rendered.dimensions.at(-1)).toEqual([208, 192])
    expect(ctx.rect).toHaveBeenCalledWith(0, 0, 208, 192)
    expect(ctx.clip).toHaveBeenCalledOnce()
    expect(ctx.fillRect).toHaveBeenCalledOnce()
    expect(ctx.strokeRect).toHaveBeenCalledOnce()
    expect(ctx.arc).toHaveBeenCalledOnce()
    expect(canvas.dataset.trainingGuides).toBe('yard')
    guides.update(undefined, [], () => true)
    expect(canvas.dataset.trainingGuides).toBeUndefined()
    guides.dispose()
})
