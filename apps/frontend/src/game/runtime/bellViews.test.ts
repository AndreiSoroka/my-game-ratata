import type { GameEventPayload, WorldObjectSnapshot } from '@my-game-ratata/contracts'
import type { Engine, ImageSource } from 'excalibur'
import { expect, it, vi } from 'vitest'

import { type BellImages, BellViews } from './bellViews'

const calls = vi.hoisted(() => {
    class TestActor {
        public pos = { x: 0, y: 0 }
        public z = 0
        public graphics = { isVisible: true, use: vi.fn<(graphic: unknown) => void>() }
        public kill = vi.fn<() => void>()
        public constructor(public options: { anchor: unknown }) {}
    }
    return { animation: vi.fn<(options: unknown) => void>(), TestActor }
})
vi.mock('excalibur', () => ({
    vec: (x: number, y: number) => ({ x, y }),
    AnimationStrategy: { Freeze: 'freeze' },
    CollisionType: { PreventCollision: 'prevent' },
    Animation: class {
        public constructor(options: unknown) {
            calls.animation(options)
        }
    },
    Actor: calls.TestActor,
}))
function fixture() {
    calls.animation.mockClear()
    const add = vi.fn<(actor: InstanceType<typeof calls.TestActor>) => void>()
    const image = (name: string) => ({ toSprite: () => ({ name }) }) as unknown as ImageSource
    const images: BellImages = {
        states: { silent: image('silent'), prepared: image('prepared'), active: image('active') },
        swing: Array.from({ length: 4 }, (_, index) => image(`swing-${String(index)}`)),
    }
    return { views: new BellViews({ add } as unknown as Engine, images), add }
}
function bell(state: 'silent' | 'prepared' | 'active'): WorldObjectSnapshot {
    return {
        id: 'bell',
        kind: 'bell',
        name: 'Колокол',
        position: { x: 100, y: 100 },
        bounds: { x: 92, y: 92, width: 16, height: 16 },
        depleted: false,
        bell: { state },
    }
}
const activation: GameEventPayload = {
    kind: 'bell_activate',
    objectId: 'bell',
    eventId: 'activation-1',
}

it('shows all three authoritative states at one common ground anchor without ringing on snapshots', () => {
    const f = fixture()
    for (const state of ['silent', 'prepared', 'active'] as const)
        f.views.update([bell(state)], 'world', () => true)
    const actor = f.add.mock.calls[0]![0]
    expect(f.add).toHaveBeenCalledOnce()
    expect(actor.options.anchor).toEqual({ x: 0.5, y: 60 / 64 })
    expect(actor.pos).toEqual({ x: 100, y: 108 })
    expect(actor.graphics.use.mock.calls.map((call: unknown[]) => call[0])).toEqual([
        { name: 'silent' },
        { name: 'prepared' },
        { name: 'active' },
    ])
    expect(calls.animation).not.toHaveBeenCalled()
})

it('plays four swing frames once for a receipt and freezes on active despite repeated snapshots', () => {
    const f = fixture()
    f.views.update([bell('prepared')], 'world', () => true)
    f.views.receive(activation)
    f.views.receive(activation)
    f.views.update([bell('active')], 'world', () => true)
    f.views.update([bell('active')], 'world', () => true)
    expect(calls.animation).toHaveBeenCalledExactlyOnceWith({
        strategy: 'freeze',
        frames: ['swing-0', 'swing-1', 'swing-2', 'swing-3', 'active'].map((name) => ({
            graphic: { name },
            duration: 150,
        })),
    })
})

it('does not replay a hidden activation on entering the chapel or returning after travel', () => {
    const f = fixture()
    f.views.update([bell('prepared')], 'world', () => false)
    f.views.receive(activation)
    f.views.update([bell('active')], 'world', () => true)
    f.views.receive(activation)
    f.views.clear()
    f.views.update([bell('active')], 'world', () => true)
    f.views.receive(activation)
    expect(calls.animation).not.toHaveBeenCalled()
})

it('clears actors and receipt history when a different server world takes over', () => {
    const f = fixture()
    f.views.update([bell('prepared')], 'old', () => true)
    f.views.receive(activation)
    f.views.update([bell('prepared')], 'new', () => true)
    f.views.receive(activation)
    expect(f.add.mock.calls[0]![0].kill).toHaveBeenCalledOnce()
    expect(calls.animation).toHaveBeenCalledTimes(2)
    f.views.clear()
    expect(f.add.mock.calls[1]![0].kill).toHaveBeenCalledOnce()
})
