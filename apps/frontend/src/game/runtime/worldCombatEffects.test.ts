import { ABILITY_DEFINITIONS } from '@my-game-ratata/contracts'
import type { Engine } from 'excalibur'
import { beforeEach, expect, it, vi } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import { combatEffectCues, eventCaption } from './combatEffectPlan'
import { CombatEffects } from './combatEffects'
import { runtimeEventFeedback } from './runtimeEventFeedback'

interface View {
    pos: { x: number; y: number }
    rotation: number
    text?: string
    dead: boolean
}
const rendered = vi.hoisted(() => ({ views: [] as View[] }))
vi.mock('excalibur', () => {
    class Actor {
        public pos = { x: 0, y: 0 }
        public rotation = 0
        public dead = false
        public graphics = { use: vi.fn<() => void>(), anchor: { x: 0, y: 0 } }
        public actions = { fade: vi.fn<() => void>(), clearActions: vi.fn<() => void>() }
        public constructor(options: { pos?: { x: number; y: number }; rotation?: number }) {
            this.pos = options.pos ?? this.pos
            this.rotation = options.rotation ?? 0
            rendered.views.push(this)
        }
        public kill() {
            this.dead = true
        }
        public isKilled() {
            return this.dead
        }
    }
    return {
        Actor,
        Label: class extends Actor {
            public text: string
            public constructor(options: { pos: { x: number; y: number }; text: string }) {
                super(options)
                this.text = options.text
            }
        },
        Font: class {},
        Color: { fromHex: (x: string) => x, Black: 'black' },
        vec: (x: number, y: number) => ({ x, y }),
    }
})
vi.mock('./effectGraphics', () => ({
    BARRIER_COLOR: '#fff',
    SPARK_COLOR: '#fc0',
    FIRE_COLOR: '#f80',
    EffectGraphics: class {
        public get() {
            return {}
        }
        public clear() {}
    },
}))
vi.mock('./combatParticles', () => ({
    CombatParticles: class {
        public burst() {}
        public release() {}
        public update() {}
        public clear() {}
    },
}))
beforeEach(() => {
    rendered.views = []
})
function setup() {
    let tick: ((event: { elapsed: number }) => void) | undefined
    const actor = characterFixture('archer', { position: { x: 100, y: 100 }, facing: 'left' })
    const world = vi.fn<
        (target: {
            kind: 'grave'
            id: string
        }) => { position: { x: number; y: number } } | undefined
    >((target) => (target.id === 'stone' ? { position: { x: 150, y: 100 } } : undefined))
    const engine = {
        add: vi.fn<() => void>(),
        on: (_event: string, handler: typeof tick) => {
            tick = handler
        },
        off: vi.fn<() => void>(),
    } as unknown as Engine
    const effects = new CombatEffects(engine, (id) => (id === actor.id ? actor : undefined), world)
    return { actor, effects, world, frame: (elapsed: number) => tick?.({ elapsed }) }
}
it('aims a projectile at the typed grave without manufacturing a character target', () => {
    const { actor, effects, world, frame } = setup()
    const target = { kind: 'grave' as const, id: 'stone' }
    effects.receive({ kind: 'attack', actorId: actor.id, target, abilityId: 'shot' })
    expect(world).toHaveBeenCalledWith(target)
    expect(rendered.views).toHaveLength(1)
    expect(rendered.views[0]).toMatchObject({ pos: { x: 100, y: 85 }, rotation: 0 })
    const halfway = ABILITY_DEFINITIONS.shot.windupMs / 2
    frame(halfway)
    expect(rendered.views[0]?.pos).toEqual({ x: 125, y: 85 })
    frame(halfway)
    expect(rendered.views[0]?.dead).toBe(true)
    effects.dispose()
})

it('keeps Quick Shot aim over the moving archer and launches from the server position', () => {
    const { actor, effects, world, frame } = setup()
    const attack = {
        kind: 'attack',
        actorId: actor.id,
        abilityId: 'shot',
        actionId: 'aim:1',
        target: { kind: 'grave', id: 'stone' },
    } as const
    effects.receive({ ...attack, phase: 'started', durationMs: 200 })
    expect(world).not.toHaveBeenCalled()
    expect(rendered.views).toHaveLength(1)
    expect(rendered.views[0]?.pos).toEqual({ x: 100, y: 85 })
    actor.position = { x: 110, y: 105 }
    frame(100)
    expect(rendered.views[0]?.pos).toEqual({ x: 110, y: 86 })

    effects.receive({
        ...attack,
        phase: 'completed',
        projectile: { origin: { x: 112, y: 105 }, endpoint: { x: 150, y: 105 } },
    })
    expect(rendered.views[0]?.dead).toBe(true)
    expect(rendered.views[1]?.pos).toEqual({ x: 112, y: 90 })
    effects.dispose()
})

it.each(['Рывок: ещё 2 с.', 'Не хватает энергии'])(
    'shows a single dash caption above the actor and lets ordinary notices reach the HUD',
    (text) => {
        const { actor, effects, frame } = setup()
        const onNotice = vi.fn<(text: string) => void>()
        const releaseInputs = vi.fn<() => void>()
        const event = {
            kind: 'notice',
            noticeKind: 'dash_rejected',
            actorId: actor.id,
            text,
        } as const

        effects.receive(event)
        runtimeEventFeedback(event, actor.id, { onNotice }, releaseInputs)
        expect(onNotice).not.toHaveBeenCalled()
        expect(rendered.views).toHaveLength(1)
        expect(rendered.views[0]).toMatchObject({ text, pos: { x: 100, y: 58 } })
        frame(500)
        expect(rendered.views[0]?.pos).toEqual({ x: 100, y: 54 })
        frame(500)
        expect(rendered.views[0]?.dead).toBe(true)

        const ordinary = { kind: 'notice', actorId: actor.id, text: 'Обычное уведомление' } as const
        effects.receive(ordinary)
        runtimeEventFeedback(ordinary, actor.id, { onNotice }, releaseInputs)
        expect(rendered.views).toHaveLength(1)
        expect(onNotice).toHaveBeenCalledExactlyOnceWith(ordinary.text)
        effects.dispose()
    }
)

it('replaces the completed prayer caption with one refusal above the caster and no toast', () => {
    const { actor, effects, frame } = setup()
    const onNotice = vi.fn<(text: string) => void>()
    const releaseInputs = vi.fn<() => void>()
    effects.receive({ kind: 'cast', phase: 'completed', actorId: actor.id, abilityId: 'pray' })
    const completedCaption = rendered.views.find((view) => view.text === 'Молитва')
    expect(completedCaption?.dead).toBe(false)
    const event = {
        kind: 'notice',
        noticeKind: 'prayer_unanswered',
        actorId: actor.id,
        abilityId: 'pray',
        text: 'Божество не ответило',
    } as const
    effects.receive(event)
    runtimeEventFeedback(event, actor.id, { onNotice }, releaseInputs)
    expect(completedCaption?.dead).toBe(true)
    expect(onNotice).not.toHaveBeenCalled()
    const captions = rendered.views.filter((view) => view.text !== undefined && !view.dead)
    expect(captions).toHaveLength(1)
    expect(captions[0]).toMatchObject({ text: event.text, pos: { x: 100, y: 58 } })
    frame(1000)
    expect(captions[0]?.dead).toBe(true)
    effects.dispose()
})

it('shows exact hundredths at the grave, ignores misses and unknown world targets, and clears on dispose', () => {
    const { actor, effects } = setup()
    effects.receive({
        kind: 'world_damage',
        actorId: actor.id,
        target: { kind: 'grave', id: 'stone' },
        amount: 0.05,
    })
    expect(rendered.views[0]).toMatchObject({ text: '−0,05', pos: { x: 150, y: 58 } })
    effects.receive({
        kind: 'world_damage',
        actorId: actor.id,
        target: { kind: 'grave', id: 'missing' },
        amount: 4,
    })
    effects.receive({
        kind: 'world_damage',
        actorId: actor.id,
        target: { kind: 'grave', id: 'stone' },
        amount: 0,
    })
    expect(rendered.views).toHaveLength(1)
    effects.dispose()
    expect(rendered.views[0]?.dead).toBe(true)
    expect(eventCaption({ kind: 'world_damage', amount: 1.25, critical: true })).toBe('−1,25')
})
it.each([10_000, 50_000])(
    'keeps purification channel anchored for its authoritative %s ms duration',
    (duration) => {
        const actor = characterFixture('priest')
        const target = { kind: 'grave' as const, id: 'stone' }
        expect(
            combatEffectCues(
                {
                    kind: 'cast',
                    abilityId: 'pray',
                    actorId: actor.id,
                    target,
                    phase: 'started',
                    durationMs: duration,
                },
                actor
            )[0]
        ).toMatchObject({ kind: 'casting', target, duration, channel: true })
    }
)

it('animates an untargeted Spark along its pinned forward path after the caster turns', () => {
    const { actor, effects, frame } = setup()
    effects.receive({
        kind: 'attack',
        actorId: actor.id,
        abilityId: 'spark',
        projectile: { origin: { x: 100, y: 100 }, endpoint: { x: 180, y: 100 }, halfWidth: 16 },
    })
    expect(rendered.views[0]).toMatchObject({ pos: { x: 100, y: 85 }, rotation: 0 })
    actor.facing = 'up'
    actor.position = { x: 300, y: 300 }
    frame(100)
    expect(rendered.views[0]?.pos).toEqual({ x: 140, y: 85 })
    frame(100)
    expect(rendered.views[0]?.dead).toBe(true)
    effects.dispose()
})
