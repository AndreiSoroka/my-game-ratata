import type { Actor, Engine } from 'excalibur'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DamageFeedback } from './damageFeedback'
import { maxDamageEffects } from './damagePresentation'

interface Body {
    pos: { x: number; y: number }
    z: number
    graphics: { isVisible: boolean; material: unknown; offset: { x: number; y: number } }
    actions: { runAction: ReturnType<typeof vi.fn<(action: unknown) => void>> }
}
interface FakeLabel {
    pos: { x: number; y: number }
    graphics: { opacity: number }
    kill: ReturnType<typeof vi.fn<() => void>>
}
const objects = vi.hoisted(() => ({ labels: [] as FakeLabel[], flashes: 0 }))
vi.mock('excalibur', () => ({
    vec: (x: number, y: number) => ({ x, y }),
    Color: { fromHex: (value: string) => value, Black: 'black' },
    Font: class {},
    Label: class {
        public pos = { x: 0, y: 0 }
        public graphics = { anchor: undefined, opacity: 1 }
        public kill = vi.fn<() => void>()
        public constructor(options: { pos: { x: number; y: number } }) {
            this.pos = options.pos
            objects.labels.push(this)
        }
    },
    Flash: class {
        private stopped = false
        public constructor(private readonly body: Body) {
            objects.flashes++
        }
        public reset(): void {
            this.stopped = false
        }
        public stop(): void {
            this.stopped = true
            this.body.graphics.isVisible = true
        }
        public update(): void {
            if (this.stopped) this.body.graphics.material = null
        }
    },
}))
function setup() {
    let tick: ((event: { elapsed: number }) => void) | undefined
    const off = vi.fn<(name: string, handler: unknown) => void>()
    const engine = {
        add: vi.fn<(actor: unknown) => void>(),
        on: (_: string, handler: (event: { elapsed: number }) => void) => {
            tick = handler
        },
        off,
    } as unknown as Engine
    const body: Body = {
        pos: { x: 10, y: 20 },
        z: 20,
        graphics: { isVisible: true, material: null, offset: { x: 0, y: 0 } },
        actions: { runAction: vi.fn<(action: unknown) => void>() },
    }
    const refresh = vi.fn<(id: string) => void>()
    const feedback = new DamageFeedback(engine, () => body as unknown as Actor, refresh)
    return { feedback, body, refresh, off, frame: (elapsed: number) => tick?.({ elapsed }) }
}
afterEach(() => {
    objects.labels.length = 0
    objects.flashes = 0
})

describe('bounded damage feedback lifecycle', () => {
    it('renders one flash and a rising damage number without changing world position', () => {
        const { feedback, body, frame, refresh } = setup()
        try {
            feedback.show({ kind: 'damage', targetId: 'hero', amount: 4 }, true)
            expect(body.actions.runAction).toHaveBeenCalledOnce()
            expect(objects.labels).toHaveLength(1)
            const label = objects.labels[0]!
            const y = label.pos.y
            frame(100)
            expect(label.pos.y).toBeLessThan(y)
            expect(label.graphics.opacity).toBeLessThan(1)
            expect(feedback.elapsed('hero')).toBe(100)
            expect(refresh).toHaveBeenCalledWith('hero')
            expect(body.pos).toEqual({ x: 10, y: 20 })
            frame(140)
            expect(feedback.elapsed('hero')).toBeUndefined()
            expect(body.graphics.offset).toEqual({ x: 0, y: 0 })
            frame(610)
            expect(label.kill).toHaveBeenCalledOnce()
        } finally {
            feedback.dispose()
        }
    })
    it('does not queue repeated flashes, caps labels and completely clears effects on map change/disposal', () => {
        const { feedback, body, off } = setup()
        for (let index = 0; index < 40; index++)
            feedback.show({ kind: 'damage', targetId: 'hero', amount: 1 }, false)
        expect(body.actions.runAction).toHaveBeenCalledOnce()
        expect(objects.flashes).toBe(1)
        expect(objects.labels.filter((label) => label.kill.mock.calls.length === 0)).toHaveLength(
            maxDamageEffects
        )
        body.graphics.isVisible = false
        feedback.clear()
        expect(objects.labels.every((label) => label.kill.mock.calls.length === 1)).toBe(true)
        expect(body.graphics.material).toBeNull()
        expect(body.graphics.isVisible).toBe(false)
        expect(feedback.elapsed('hero')).toBeUndefined()
        feedback.dispose()
        expect(off).toHaveBeenCalledWith('postupdate', expect.any(Function))
    })
    it('never flashes for attack attempts or hidden targets', () => {
        const { feedback, body } = setup()
        try {
            feedback.show({ kind: 'attack', targetId: 'hero', amount: 2 }, true)
            body.graphics.isVisible = false
            feedback.show({ kind: 'damage', targetId: 'hero', amount: 2 }, true)
            expect(objects.labels).toHaveLength(0)
            expect(body.actions.runAction).not.toHaveBeenCalled()
        } finally {
            feedback.dispose()
        }
    })
})
