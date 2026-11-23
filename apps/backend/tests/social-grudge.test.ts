import { expect, it } from 'vitest'

import { SocialHistory } from '../src/game/socialHistory'
import type { SocialIncident } from '../src/game/socialHistoryTypes'

it('fades only the directed grudge on game time and keeps it longer for resentful observers', () => {
    const locationId = 'map-2-2'
    const history = new SocialHistory({
        participant: (id) => ({
            id,
            locationId,
            available: true,
            canSpeak: true,
        }),
        residents: () => [],
        react: () => undefined,
        resentment: (id) => (id === 'resentful' ? 100 : 0),
    })
    const incident: SocialIncident = {
        id: 'incident-1',
        kind: 'theft',
        actorId: 'suspect',
        targetId: 'victim',
        locationId,
        at: 100,
        severity: 3,
    }
    const observers = ['patient', 'resentful']
    history.record(incident, observers)
    const initial = history.relationship('patient', 'suspect')
    expect(initial.grudge).toBe(12)
    expect(history.relationship('resentful', 'suspect')).toEqual(initial)
    expect(history.relationship('patient', 'suspect', 90_100)).toEqual({
        ...initial,
        grudge: 9,
    })
    expect(history.relationship('resentful', 'suspect', 90_100)).toEqual(
        initial
    )
    expect(history.relationship('patient', 'suspect')).toEqual(initial)
    expect(history.relationship('suspect', 'patient', 90_100).grudge).toBe(0)

    history.record(
        { ...incident, id: 'incident-2', kind: 'honest_exchange', at: 45_100 },
        observers
    )
    expect(history.relationship('patient', 'suspect', 90_100).grudge).toBe(9)
    expect(history.relationship('resentful', 'suspect', 120_100).grudge).toBe(
        11
    )
    expect(
        history.relationship('resentful', 'suspect', 10_000_000).grudge
    ).toBe(0)
})
