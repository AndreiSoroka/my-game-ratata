import {
    type CharacterAbilitiesSnapshot,
    type PrayerActionId,
    prayerActionIds,
} from '@my-game-ratata/contracts'
import type { Engine, ImageSource } from 'excalibur'
import { afterEach, expect, it, vi } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import { type PrayerAreaImages, PrayerAreaViews } from './prayerAreaViews'

interface OutlineOptions {
    width: number
    height: number
    draw: (context: CanvasRenderingContext2D) => void
}

interface AreaGraphic {
    readonly options: {
        members: [
            { graphic: PrayerActionId; offset: { x: number; y: number } },
            { graphic: { options: OutlineOptions }; offset: { x: number; y: number } },
        ]
    }
}

interface AreaActor {
    readonly options: { z: number; anchor: { x: number; y: number }; collisionType: string }
    readonly graphics: {
        use: ReturnType<typeof vi.fn<(graphic: AreaGraphic) => void>>
        opacity: number
    }
    readonly on: ReturnType<
        typeof vi.fn<(event: 'preupdate', handler: (event: { elapsed: number }) => void) => void>
    >
    readonly kill: ReturnType<typeof vi.fn<() => void>>
    pos: { x: number; y: number }
    scale: { x: number; y: number }
}

vi.mock('excalibur', () => ({
    Actor: class {
        public readonly graphics = { use: vi.fn<(graphic: AreaGraphic) => void>(), opacity: 1 }
        public readonly on =
            vi.fn<(event: 'preupdate', handler: (event: { elapsed: number }) => void) => void>()
        public readonly kill = vi.fn<() => void>()
        public constructor(public readonly options: AreaActor['options']) {}
    },
    Canvas: class {
        public constructor(public readonly options: OutlineOptions) {}
    },
    GraphicsGroup: class {
        public constructor(public readonly options: AreaGraphic['options']) {}
    },
    CollisionType: { PreventCollision: 'prevent' },
    vec: (x: number, y: number) => ({ x, y }),
}))

type SpriteOptions = Parameters<ImageSource['toSprite']>[0]

afterEach(() => vi.unstubAllGlobals())

function setup(reducedMotion = false) {
    vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }))
    const add = vi.fn<(actor: AreaActor) => void>()
    const images = new Map(
        prayerActionIds.map((id) => [
            id,
            { toSprite: vi.fn<(options: SpriteOptions) => PrayerActionId>(() => id) },
        ])
    )
    const views = new PrayerAreaViews(
        { add } as unknown as Engine,
        images as unknown as PrayerAreaImages
    )
    return { views, add, images }
}

function caster(id: string, abilityId: PrayerActionId, radius?: number, completesAt = 4000) {
    const abilities: CharacterAbilitiesSnapshot = {
        known: [abilityId],
        cooldowns: {},
        barrier: null,
        lastPrayerAbilityId: abilityId,
        prayers: {
            [abilityId]: {
                radius: 64,
                durationMs: 3000,
                manaCost: 5,
                area: false,
                harm: false,
                ...(abilityId === 'pray_road' ? { energyRecoveryRadius: 68 } : {}),
            },
        },
        casting: {
            abilityId,
            targetId: 'target',
            startedAt: 1000,
            completesAt,
            ...(radius === undefined ? {} : { radius }),
        },
    }
    return { ...characterFixture(id, { position: { x: 120, y: 150 } }), abilities }
}

it('selects the five distinct action sprites for channels first seen after they start', () => {
    const { views, add, images } = setup()
    views.sync([], 1500)
    views.sync(
        prayerActionIds.map((id) => caster(id, id, 48)),
        2000
    )

    expect(views.states()).toEqual(
        prayerActionIds.map((id) => ({ actorId: id, abilityId: id, radius: 48 }))
    )
    expect(add).toHaveBeenCalledTimes(5)
    for (const [index, id] of prayerActionIds.entries()) {
        expect(images.get(id)?.toSprite).toHaveBeenCalledExactlyOnceWith({
            destSize: { width: 96, height: 96 },
        })
        const actor = add.mock.calls[index]![0]
        expect(actor.graphics.use).toHaveBeenCalledOnce()
        expect(actor.graphics.use.mock.lastCall?.[0].options.members[0]).toEqual({
            graphic: id,
            offset: { x: 1, y: 1 },
        })
        expect(actor.options).toMatchObject({
            anchor: { x: 0.5, y: 0.5 },
            collisionType: 'prevent',
        })
        expect(actor.options.z).toBeGreaterThan(-100)
        expect(actor.options.z).toBeLessThan(0)
        expect(actor.pos).toEqual({ x: 120, y: 150 })
        expect(actor.scale).toEqual({ x: 1, y: 1 })
    }
})

it('softly pulses each caster on scene updates without changing its shared graphic', () => {
    const { views, add, images } = setup()
    views.sync([caster('first', 'pray'), caster('second', 'pray')], 1500)
    const first = add.mock.calls[0]![0]
    const second = add.mock.calls[1]![0]
    expect(first.graphics.use.mock.calls[0]![0]).toBe(second.graphics.use.mock.calls[0]![0])
    expect(images.get('pray')?.toSprite).toHaveBeenCalledOnce()
    expect(first.graphics.opacity).toBeCloseTo(0.24)
    expect(second.graphics.opacity).toBeCloseTo(0.24)
    expect(first.on.mock.calls[0]![0]).toBe('preupdate')
    const update = first.on.mock.calls[0]![1]
    update({ elapsed: 400 })
    expect(first.graphics.opacity).toBeCloseTo(0.32)
    expect(second.graphics.opacity).toBeCloseTo(0.24)
    views.sync([caster('first', 'pray'), caster('second', 'pray')], 2000)
    expect(first.graphics.opacity).toBeCloseTo(0.32)
    update({ elapsed: 400 })
    expect(first.graphics.opacity).toBeCloseTo(0.4)
    update({ elapsed: 800 })
    expect(first.graphics.opacity).toBeCloseTo(0.24)
    update({ elapsed: 1600 * 500 + 800 })
    expect(first.graphics.opacity).toBeCloseTo(0.4)
})

it('keeps prayer areas quietly static with reduced motion and removes them on teardown', () => {
    const { views, add } = setup(true)
    views.sync([caster('priest', 'pray')], 1500)
    const area = add.mock.calls[0]![0]
    expect(area.graphics.opacity).toBeCloseTo(0.32)
    expect(area.on).not.toHaveBeenCalled()
    views.sync([caster('priest', 'pray_road')], 2000)
    expect(area.graphics.opacity).toBeCloseTo(0.32)
    views.clear()
    expect(area.kill).toHaveBeenCalledOnce()
})

it('uses twice the frozen cast radius as the diameter, follows the caster and reuses its view', () => {
    const { views, add } = setup()
    const actor = caster('priest', 'pray_woven', 80)
    views.sync([actor], 1000)

    const area = add.mock.calls[0]![0]
    expect(area.scale).toEqual({ x: 160 / 96, y: 160 / 96 })
    const { graphic: outline, offset } = area.graphics.use.mock.lastCall![0].options.members[1]
    expect(outline.options).toMatchObject({ width: 98, height: 98 })
    expect(offset).toEqual({ x: 0, y: 0 })
    const context = {
        save: vi.fn<() => void>(),
        beginPath: vi.fn<() => void>(),
        arc: vi.fn<CanvasRenderingContext2D['arc']>(),
        stroke: vi.fn<() => void>(),
        restore: vi.fn<() => void>(),
    }
    outline.options.draw(context as unknown as CanvasRenderingContext2D)
    expect(context.arc).toHaveBeenCalledExactlyOnceWith(49, 49, 48, 0, 2 * Math.PI)

    views.sync([{ ...actor, position: { x: 138, y: 142 } }], 2000)
    expect(add).toHaveBeenCalledOnce()
    expect(area.pos).toEqual({ x: 138, y: 142 })
    expect(area.graphics.use).toHaveBeenCalledOnce()

    views.sync([caster('priest', 'pray_road')], 2001)
    expect(views.states()).toEqual([{ actorId: 'priest', abilityId: 'pray_road', radius: 68 }])
    expect(add).toHaveBeenCalledOnce()
    expect(area.graphics.use.mock.lastCall?.[0].options.members[0].graphic).toBe('pray_road')
    expect(area.scale).toEqual({ x: 136 / 96, y: 136 / 96 })
})

it('clears expired, cancelled, dead, offline and unseen channels and then clears the scene', () => {
    const { views, add } = setup()
    const expired = caster('expired', 'pray', 48, 3000)
    const cancelled = caster('cancelled', 'pray_road')
    const dead = caster('dead', 'pray_lantern')
    const offline = caster('offline', 'pray_grave')
    const unseen = caster('unseen', 'pray_woven')
    const active = caster('active', 'pray')
    const devotion = caster('devotion', 'pray')
    views.sync([expired, cancelled, dead, offline, unseen, active], 2000)

    views.sync(
        [
            expired,
            { ...cancelled, abilities: { ...cancelled.abilities, casting: null } },
            { ...dead, alive: false },
            { ...offline, tags: ['offline'] },
            active,
            { ...devotion, abilities: { ...devotion.abilities, casting: null } },
        ],
        3000
    )
    expect(views.states()).toEqual([{ actorId: 'active', abilityId: 'pray', radius: 64 }])
    expect(add).toHaveBeenCalledTimes(6)
    for (const [actor] of add.mock.calls.slice(0, -1)) expect(actor.kill).toHaveBeenCalledOnce()

    views.clear()
    expect(add.mock.lastCall?.[0].kill).toHaveBeenCalledOnce()
    expect(views.states()).toEqual([])
})
