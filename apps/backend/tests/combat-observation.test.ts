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
    it('projects private segments and foreign percentages without retaining numeric fields', () => {
        const { observer, target, view } = observationFixture()
        target.hp = target.maxHp * 0.375
        target.abilities.barrier = {
            expiresAt: 5000,
            practiced: false,
        }
        const own = observeCharacterCombat(
            observer.snapshot(1000),
            observer,
            view
        )
        expect(own.health).toEqual({
            kind: 'percent',
            percent: 100,
            segments: [40, 20, 20, 20],
            needsRestoration: false,
        })
        expect(own.resources).toEqual({
            mana: {
                kind: 'percent',
                percent: 100,
                hasCapacity: true,
                segments: [40, 20, 20, 20],
                needsRestoration: false,
            },
            energy: {
                kind: 'percent',
                percent: 100,
                hasCapacity: true,
                segments: [40, 20, 20, 20],
                needsRestoration: false,
            },
        })
        expect(own.resourceChecks?.dash).toBe('ready')
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
        expect(foreign).not.toHaveProperty('resourceChecks')
        const anonymous = observeCharacterCombat(
            observer.snapshot(1000),
            observer,
            { ...view, observer: undefined }
        )
        expect(anonymous.health.kind).toBe('percent')
        expect(anonymous).not.toHaveProperty('resourceChecks')
    })

    it('keeps grave simulation health internal and grants every numeric channel only with capability', () => {
        const { observer, target, view } = observationFixture()
        const grave: GraveCombatTarget = {
            id: 'grave',
            buriedName: 'Игнат',
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
        expect(observeGraveCombat(grave, view).buriedName).toBe('Игнат')
        observer.exactCombatNumbers = true
        target.abilities.barrier = {
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
        expect(snapshot.abilities?.barrier).toEqual({ expiresAt: 5000 })
        expect(snapshot.resources).toEqual(target.snapshot(1000).resources)
        expect(snapshot).not.toHaveProperty('resourceChecks')
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

describe('owner resource knowledge', () => {
    it('reveals mana in finer segments before showing exact values, only for the owner', () => {
        const { observer, target, view } = observationFixture()
        const state = observer.progression.constellations.opened
        observer.mana = 15
        const project = (viewer = observer) =>
            observeCharacterCombat(observer.snapshot(1000), observer, {
                ...view,
                observer: viewer,
            }).resources.mana
        expect(project()).toMatchObject({
            percent: 40,
            segments: [40, 20, 20, 20],
        })
        state.add('magic.mana1')
        expect(project()).toMatchObject({
            percent: 50,
            segments: [30, 20, 10, 10, 10, 10, 10],
        })
        state.add('magic.mana2')
        expect(project()).toMatchObject({
            percent: 40,
            segments: Array<number>(10).fill(10),
        })
        state.add('magic.mana3')
        expect(project()).toEqual({ kind: 'exact', current: 15, max: 40 })
        expect(project(target)).toEqual({
            kind: 'percent',
            percent: 37,
            hasCapacity: true,
        })
    })

    it('applies health and energy knowledge independently before exposing exact pools', () => {
        const { observer, view } = observationFixture()
        const state = observer.progression.constellations.opened
        const project = () =>
            observeCharacterCombat(observer.snapshot(1000), observer, view)
        observer.hp = observer.maxHp * 0.321
        observer.energy = observer.config.resources.maxEnergy * 0.321
        const fine = {
            kind: 'percent',
            percent: 50,
            segments: [30, 20, 10, 10, 10, 10, 10],
            needsRestoration: true,
        }
        state.add('life.hp1')
        expect(project().health).toEqual(fine)
        expect(project().resources.energy).toMatchObject({ percent: 40 })
        state.add('life.energy1')
        expect(project().resources.energy).toEqual({
            ...fine,
            hasCapacity: true,
        })
        state.add('life.hp2')
        expect(project().health).toEqual({
            ...fine,
            percent: 40,
            segments: Array<number>(10).fill(10),
        })
        state.add('life.hp3')
        state.add('life.energy2')
        const smooth = { kind: 'percent', percent: 32 }
        expect(project().health).toEqual(smooth)
        expect(project().resources.energy).toEqual({
            ...smooth,
            hasCapacity: true,
        })
        state.add('life.hp4')
        state.add('life.energy3')
        expect(project().health).toEqual(observer.snapshot(1000).health)
        expect(project().resources.energy).toEqual(
            observer.snapshot(1000).resources.energy
        )
        expect(project().resources.mana.kind).toBe('percent')
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
                observeCombatEvent(eventFor(observer, kind), view)
            ).not.toHaveProperty('amount')
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
        expect(observeCombatEvent(water, ownView)?.text).toBe('Пьёт воду.')
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
