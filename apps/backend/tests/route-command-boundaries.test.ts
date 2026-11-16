import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_ROUTE_POINTS } from '../src/game/characterRoute'
import { advanceCharacter } from '../src/game/movement'
import { routeCommandFixture } from './routeCommandFixture'

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1500)
})
afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe.each(['player', 'agent'] as const)(
    '%s route command validation',
    (controller) => {
        it('rejects replacement and append without losing the existing path, cast, timer or numbering', () => {
            const f = routeCommandFixture(controller)
            f.command({ x: 120, y: 40 })
            f.command({ x: 120, y: 80 }, true)
            f.prayer()
            const previous = f.read()
            f.onRouteStart.mockClear()
            f.events.length = 0
            for (const append of [false, true]) {
                const result = f.command({ x: 248, y: 80 }, append)
                if (controller === 'agent') {
                    expect(result?.accepted).toBe(false)
                }
                expect(f.read()).toEqual(previous)
            }
            expect(f.onRouteStart).not.toHaveBeenCalled()
            expect(f.events).toEqual(
                Array.from({ length: 2 }, () => ({
                    kind: 'notice',
                    actorId: f.actor.id,
                    audienceIds: [f.actor.id],
                    text: 'Не удалось поставить точку: рядом нет прохода.',
                }))
            )
            f.command({ x: 80, y: 120 }, true)
            expect(
                f.read().control.route?.points.map((point) => point.number)
            ).toEqual([1, 2, 3])
        })

        it('keeps automatic target control and prayer when no reachable destination exists', () => {
            const f = routeCommandFixture(controller)
            expect(f.follow()).toBe(true)
            f.actor.setPath([{ x: 40, y: 48 }])
            f.prayer()
            const before = f.read()
            f.command({ x: 248, y: 80 })
            expect(f.read()).toEqual(before)
            expect(f.onRouteStart).not.toHaveBeenCalled()
        })

        it('replaces control once only after resolving and interrupts a pending prayer once', () => {
            const f = routeCommandFixture(controller)
            f.command({ x: 120, y: 40 })
            f.prayer()
            f.events.length = 0
            f.onRouteStart.mockClear()
            const search = vi.spyOn(f.navigation, 'findPathWorld')
            f.command({ x: 80, y: 120 })
            expect(search).toHaveBeenCalledOnce()
            expect(f.onRouteStart).toHaveBeenCalledOnce()
            expect(f.read().control.route?.points).toEqual([
                { number: 1, position: { x: 80, y: 120 } },
            ])
            expect(f.actor.remainingPath().at(-1)).toEqual({ x: 80, y: 120 })
            expect(f.actor.abilities.casting).toBeNull()
            expect(
                f.events.filter(
                    (event) =>
                        event.kind === 'cast' && event.phase === 'interrupted'
                )
            ).toHaveLength(1)
        })
    }
)

describe.each(['player', 'agent'] as const)(
    '%s append and feedback boundaries',
    (controller) => {
        it('preserves the current segment on Shift append and records only the actual adjusted destination', () => {
            const f = routeCommandFixture(controller)
            f.command({ x: 120, y: 40 })
            advanceCharacter({
                character: f.actor,
                navigation: f.navigation,
                now: 1500,
                deltaMs: 50,
            })
            const segment = structuredClone(f.actor.remainingPath())
            f.onRouteStart.mockClear()
            f.navigation.grid.solid[6 * 20 + 6] = true
            f.command({ x: 104, y: 104 }, true)
            expect(f.actor.remainingPath()).toEqual(segment)
            expect(f.onRouteStart).not.toHaveBeenCalled()
            const point = f.read().control.route?.points.at(-1)
            expect(point?.number).toBe(2)
            expect(point?.position).not.toEqual({ x: 104, y: 104 })
            expect(f.events).toEqual([
                {
                    kind: 'notice',
                    actorId: f.actor.id,
                    audienceIds: [f.actor.id],
                    text: 'Точка 2 перенесена на ближайшее доступное место',
                },
            ])
        })

        it('rejects a full queue without resetting its current segment or consuming another number', () => {
            const f = routeCommandFixture(controller)
            for (let index = 0; index < MAX_ROUTE_POINTS; index++) {
                f.command({ x: 120, y: 40 }, index > 0)
            }
            const before = f.read()
            f.onRouteStart.mockClear()
            f.command({ x: 80, y: 80 }, true)
            expect(f.read()).toEqual(before)
            expect(f.onRouteStart).not.toHaveBeenCalled()
            expect(f.events.at(-1)).toEqual({
                kind: 'notice',
                actorId: f.actor.id,
                audienceIds: [f.actor.id],
                text: 'Маршрут уже содержит 32 точки.',
            })
        })

        it.each(['dead', 'offline', 'retired'] as const)(
            'cannot mutate routes for an unavailable %s actor',
            (state) => {
                const f = routeCommandFixture(controller)
                f.command({ x: 120, y: 40 })
                if (state === 'dead') {
                    f.actor.alive = false
                }
                if (state === 'offline') {
                    f.actor.tags.add('offline')
                }
                if (state === 'retired') {
                    f.actor.tags.add('state.retired')
                }
                const before = f.read()
                f.onRouteStart.mockClear()
                const result = f.command({ x: 80, y: 120 })
                if (controller === 'agent') {
                    expect(result?.accepted).toBe(false)
                }
                expect(f.read()).toEqual(before)
                expect(f.onRouteStart).not.toHaveBeenCalled()
            }
        )
    }
)

describe('external agent route authority', () => {
    it('rejects invalid coordinates and out-of-map destinations before replacing any route or pending cast', () => {
        const f = routeCommandFixture('agent')
        f.command({ x: 120, y: 40 })
        f.prayer()
        const before = f.read()
        f.onRouteStart.mockClear()
        for (const target of [
            { x: 999, y: 40 },
            { x: NaN, y: 40 },
            { x: 40, y: Infinity },
        ]) {
            expect(f.command(target)?.accepted).toBe(false)
            expect(f.read()).toEqual(before)
        }
        expect(f.onRouteStart).not.toHaveBeenCalled()
    })
})

describe('successful appended movement interrupts prayer', () => {
    it.each(['player', 'agent'] as const)(
        '%s keeps its current path while emitting one cast interruption',
        (controller) => {
            const f = routeCommandFixture(controller)
            f.command({ x: 120, y: 40 })
            f.prayer()
            expect(f.actor.abilities.casting).not.toBeNull()
            const path = structuredClone(f.actor.remainingPath())
            f.onRouteStart.mockClear()
            f.command({ x: 120, y: 80 }, true)
            expect(f.actor.remainingPath()).toEqual(path)
            expect(
                f.read().control.route?.points.map((point) => point.number)
            ).toEqual([1, 2])
            expect(f.onRouteStart).not.toHaveBeenCalled()
            expect(f.actor.abilities.casting).toBeNull()
            expect(f.actor.isActionLocked(1500)).toBe(false)
            expect(f.events).toEqual([
                expect.objectContaining({ kind: 'cast', phase: 'interrupted' }),
            ])
        }
    )
})
