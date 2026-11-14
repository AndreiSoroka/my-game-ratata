import { afterEach, describe, expect, it, vi } from 'vitest'

import { setCharacterControlSource } from '../src/game/characterSoul'
import {
    observeCharacterCombat,
    observeCombatEvent,
    observeCombatEvents,
    observeGraveCombat,
} from '../src/game/combatObservation'
import type { GraveCombatTarget } from '../src/game/graveRules'
import {
    eventFor,
    observationFixture,
    trainingLocationId,
} from './combatObservationFixture'

afterEach(() => vi.restoreAllMocks())

describe('observer combat information', () => {
    it('projects foreign health downwards without retaining exact health or barrier fields', () => {
        const { observer, target, view } = observationFixture()
        target.hp = target.maxHp * 0.375
        target.abilities.barrier = {
            remaining: 3.25,
            expiresAt: 5000,
            practiced: false,
        }
        const own = observeCharacterCombat(
            observer.snapshot(1000),
            observer,
            view
        )
        expect(own.health).toEqual({
            kind: 'exact',
            current: observer.hp,
            max: observer.maxHp,
        })
        expect(own.resources).toEqual(observer.snapshot(1000).resources)
        const foreign = observeCharacterCombat(
            target.snapshot(1000),
            target,
            view
        )
        expect(foreign.health).toEqual({ kind: 'percent', percent: 37 })
        expect(foreign.abilities?.barrier).toEqual({ expiresAt: 5000 })
        expect(JSON.stringify(foreign)).not.toContain('"current"')
        expect(foreign).not.toHaveProperty('hp')
        expect(foreign).not.toHaveProperty('maxHp')
        const anonymous = observeCharacterCombat(
            observer.snapshot(1000),
            observer,
            { ...view, observer: undefined }
        )
        expect(anonymous.health.kind).toBe('percent')
    })

    it('keeps grave simulation health internal and grants every numeric channel only with capability', () => {
        const { observer, target, view } = observationFixture()
        const grave: GraveCombatTarget = {
            id: 'grave',
            locationId: trainingLocationId,
            position: { x: 100, y: 100 },
            material: 'stone',
            phase: 'active',
            hp: 37.8,
            maxHp: 100,
        }
        expect(observeGraveCombat(grave, view).health).toEqual({
            kind: 'percent',
            percent: 37,
        })
        expect(observeGraveCombat(grave, view)).not.toHaveProperty('hp')
        observer.exactCombatNumbers = true
        target.abilities.barrier = {
            remaining: 3.25,
            expiresAt: 5000,
            practiced: false,
        }
        const snapshot = observeCharacterCombat(
            target.snapshot(1000),
            target,
            view
        )
        expect(snapshot.health).toEqual({
            kind: 'exact',
            current: target.hp,
            max: target.maxHp,
        })
        expect(snapshot.abilities?.barrier?.remaining).toBe(3.25)
        expect(observeGraveCombat(grave, view).health).toEqual({
            kind: 'exact',
            current: 37.8,
            max: 100,
        })
        for (const kind of [
            'damage',
            'world_damage',
            'heal',
            'absorb',
            'item_eat',
        ] as const) {
            expect(
                observeCombatEvent(eventFor(target, kind), view)?.amount
            ).toBe(7.25)
        }
    })
})

describe('observer combat events', () => {
    it('redacts combat results per recipient while preserving domain events and noncombat quantities', () => {
        const { target, observer, view } = observationFixture()
        const damage = eventFor(target)
        expect(observeCombatEvent(damage, view)).toEqual({
            kind: 'damage',
            actorId: 'attacker',
            targetId: target.id,
            hitQuality: 'strong',
        })
        expect(observeCombatEvent(eventFor(observer), view)).not.toHaveProperty(
            'amount'
        )
        for (const kind of ['heal', 'absorb', 'item_eat', 'revive'] as const) {
            expect(
                observeCombatEvent(eventFor(target, kind), view)
            ).not.toHaveProperty('amount')
            expect(
                observeCombatEvent(eventFor(observer, kind), view)?.amount
            ).toBe(7.25)
        }
        expect(
            observeCombatEvent(
                { ...eventFor(target, 'status'), statusId: 'barrier' },
                view
            )
        ).not.toHaveProperty('amount')
        expect(
            observeCombatEvent(eventFor(target, 'resource_gather'), view)
                ?.amount
        ).toBe(7.25)
        expect(damage.amount).toBe(7.25)
        expect(
            observeCombatEvent(damage, { ...view, observer: undefined })
        ).not.toHaveProperty('amount')
    })

    it('filters private recipients even for capability and removes numeric recovery prose for other observers', () => {
        const { target, observer, view } = observationFixture()
        observer.exactCombatNumbers = true
        const event = { ...eventFor(target, 'heal'), audienceIds: [target.id] }
        expect(observeCombatEvents([event], view)).toEqual([])
        observer.exactCombatNumbers = false
        const water = {
            kind: 'water_drink',
            actorId: target.id,
            text: 'Энергия +17.',
        } as const
        expect(observeCombatEvent(water, view)?.text).toBe('Пьёт воду.')
        const ownView = { ...view, observer: target }
        expect(observeCombatEvent(water, ownView)?.text).toBe('Энергия +17.')
        expect(observeCombatEvent(event, ownView)).not.toHaveProperty(
            'audienceIds'
        )
        expect(event.audienceIds).toEqual([target.id])
    })
})

describe('training measurement exception', () => {
    it('reveals dummy damage only to a living connected observer inside its own yard with sight', () => {
        const { dummy, target, view } = observationFixture()
        expect(observeCombatEvent(eventFor(dummy), view)?.amount).toBe(7.25)
        expect(observeCombatEvent(eventFor(target), view)).not.toHaveProperty(
            'amount'
        )
        const dummyHealth = observeCharacterCombat(
            dummy.snapshot(1000),
            dummy,
            view
        )
        expect(dummyHealth.health.kind).toBe('percent')
        if (view.navigation === undefined) {
            throw new Error('Expected navigation')
        }
        vi.spyOn(view.navigation, 'hasLineOfSight').mockReturnValue(false)
        expect(observeCombatEvent(eventFor(dummy), view)).not.toHaveProperty(
            'amount'
        )
    })

    it.each([
        'outside',
        'dead',
        'offline',
        'retired',
        'disconnected',
        'location',
        'unseen',
    ] as const)(
        'withholds exact dummy damage when the observer is %s',
        (condition) => {
            const { dummy, observer, view } = observationFixture()
            switch (condition) {
                case 'outside':
                    observer.position = { x: 160, y: 100 }
                    break
                case 'dead':
                    observer.alive = false
                    break
                case 'offline':
                    observer.tags.add('offline')
                    break
                case 'retired':
                    observer.tags.add('state.retired')
                    break
                case 'disconnected':
                    observer.connected = false
                    break
                case 'location':
                    observer.locationId = 'map-2-1'
                    break
                case 'unseen':
                    dummy.position = { x: 500, y: 500 }
                    break
            }
            expect(
                observeCombatEvent(eventFor(dummy), view)
            ).not.toHaveProperty('amount')
        }
    )

    it('uses an authoritative live model lease rather than a stale model soul label', () => {
        const { dummy, observer, view } = observationFixture()
        observer.connected = false
        setCharacterControlSource(observer, 'model')
        expect(observeCombatEvent(eventFor(dummy), view)).not.toHaveProperty(
            'amount'
        )
        const leasedView = {
            ...view,
            hasModelLease: (_actor: unknown, now: number) => now < 2000,
        }
        expect(observeCombatEvent(eventFor(dummy), leasedView)?.amount).toBe(
            7.25
        )
        expect(
            observeCombatEvent(eventFor(dummy), { ...leasedView, now: 2000 })
        ).not.toHaveProperty('amount')
    })
})
