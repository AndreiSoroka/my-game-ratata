import { expect, it } from 'vitest'

import type {
    ReactionAction,
    ReactionRequest,
} from '../src/game/characterReactions'
import { SocialHistory } from '../src/game/socialHistory'
import type {
    SocialIncident,
    SocialRumorReceipt,
} from '../src/game/socialHistoryTypes'

const city = 'map-2-2'
const outside = 'map-3-2'

function fixture(
    choose?: (id: string, request: ReactionRequest) => ReactionAction
) {
    const people = new Map(
        ['actor', 'merchant', 'mira', 'smith', 'guard', 'new-actor'].map(
            (id) => [
                id,
                {
                    id,
                    locationId: city,
                    available: true,
                    canSpeak: true,
                },
            ]
        )
    )
    const reactions: Array<{ id: string; request: ReactionRequest }> = []
    const history = new SocialHistory({
        participant: (id) => people.get(id),
        residents: (locationId) =>
            ['merchant', 'mira', 'smith', 'guard'].filter(
                (id) => people.get(id)?.locationId === locationId
            ),
        react(id, request) {
            reactions.push({ id, request })
            return {
                action: choose?.(id, request) ?? request.available[0] ?? 'wait',
                weights: {},
                roll: 0,
                reason: request,
            }
        },
    })
    return {
        history,
        reactions,
        move: (id: string, locationId: string, available = true) => {
            const person = people.get(id)
            if (person === undefined) {
                throw new Error('Unknown test participant')
            }
            person.locationId = locationId
            person.available = available
        },
    }
}

function theft(id = 'theft-1'): SocialIncident {
    return {
        id,
        kind: 'theft',
        actorId: 'actor',
        targetId: 'merchant',
        locationId: city,
        at: 10,
        severity: 3,
    }
}

function encounter(
    speakerId: string,
    listenerId: string,
    incidentId = theft().id
) {
    return { incidentId, speakerId, listenerId, locationId: city }
}

function told(receipt: SocialRumorReceipt | undefined) {
    expect(receipt?.status).toBe('told')
    if (receipt?.status !== 'told') {
        throw new Error('Encounter did not produce a report')
    }
    return receipt
}

it('records directed relationships and private observations once per actual incident and identity', () => {
    const { history, move } = fixture()
    move('guard', outside)
    expect(
        history.record(theft(), ['actor', 'merchant', 'guard', 'merchant'])
    ).toBe(true)
    const reputation = history.communityReputation(city, 'actor')
    const relation = history.relationship('merchant', 'actor')
    expect(reputation).toEqual({ honesty: -24, usefulness: -6, danger: 9 })
    expect(relation.trust).toBeLessThan(0)
    expect(history.relationship('actor', 'merchant').trust).toBe(0)
    expect(history.knownReputation('mira', city, 'actor').honesty).toBe(0)
    expect(history.knownIncidents('guard', city)).toEqual([])

    expect(history.record(theft(), ['merchant', 'smith'])).toBe(true)
    expect(history.record({ ...theft(), kind: 'attack' }, ['merchant'])).toBe(
        false
    )
    expect(history.communityReputation(city, 'actor')).toEqual(reputation)
    expect(history.relationship('merchant', 'actor')).toEqual(relation)
    expect(history.communityReputation(city, 'new-actor').honesty).toBe(0)
    expect(history.communityReputation(outside, 'actor').honesty).toBe(0)
    expect(history.knownIncidents('merchant', city, 'actor')).toMatchObject([
        { firsthand: true, confidence: 100, witnessId: 'merchant' },
    ])
    expect(history.knownIncidents('smith', city, 'new-actor')).toEqual([])
    move('merchant', city, false)
    move('merchant', city)
    expect(history.knownIncidents('merchant', city)).toHaveLength(1)
})

it('preserves source and belief across real meetings with separately evaluated public listeners', () => {
    const { history, reactions, move } = fixture((id, request) =>
        id === 'smith' && request.trigger === 'hear_news'
            ? 'doubt'
            : (request.available[0] ?? 'wait')
    )
    history.noteMeeting('merchant', 'mira')
    history.noteMeeting('mira', 'smith')
    history.record(theft(), ['merchant'])
    const first = told(history.share(encounter('merchant', 'mira'), 20))
    const repeated = history.share(encounter('merchant', 'mira'), 20)
    expect(repeated.status).toBe('already_attempted')
    expect(first.knowledge).toMatchObject({
        witnessId: 'merchant',
        heardFromId: 'merchant',
        believed: true,
        firsthand: false,
    })
    const publicReport = history.overhear(
        first.transmissionId,
        ['guard', 'guard', 'mira'],
        20
    )
    expect(publicReport).toMatchObject([
        { heardFromId: 'merchant', severity: first.knowledge.severity },
    ])
    expect(history.overhear(first.transmissionId, ['new-actor'], 21)).toEqual(
        []
    )

    const relayed = told(history.share(encounter('mira', 'smith'), 30))
    expect(relayed.knowledge).toMatchObject({
        witnessId: 'merchant',
        heardFromId: 'mira',
        believed: false,
        firsthand: false,
    })
    expect(relayed.knowledge.confidence).toBeLessThan(
        first.knowledge.confidence
    )
    expect(history.knownReputation('smith', city, 'actor').honesty).toBe(0)
    expect(history.knownReputation('mira', city, 'actor').honesty).toBeLessThan(
        0
    )
    expect(reactions.map(({ id, request }) => [id, request.trigger])).toEqual([
        ['merchant', 'report_news'],
        ['mira', 'hear_news'],
        ['guard', 'hear_news'],
        ['mira', 'share_news'],
        ['smith', 'hear_news'],
    ])
    move('actor', outside)
    expect(history.nextEncounter(city)).toBeUndefined()
})

it('allows a better source to refine hearsay without a second hit to reputation or trust', () => {
    const { history } = fixture()
    history.noteMeeting('merchant', 'mira')
    history.noteMeeting('guard', 'mira')
    history.record(
        {
            ...theft('favor'),
            kind: 'help',
            actorId: 'guard',
            targetId: 'mira',
            visibility: 'participants',
        },
        ['mira']
    )
    history.record(theft(), ['merchant', 'guard'])
    told(history.share(encounter('merchant', 'mira'), 20))
    const score = history.knownReputation('mira', city, 'actor')
    const relation = history.relationship('mira', 'actor')
    const community = history.communityReputation(city, 'actor')
    const refinement = told(history.share(encounter('guard', 'mira'), 25))
    expect(history.knownIncidents('mira', city, 'actor')).toEqual([
        refinement.knowledge,
    ])
    expect(refinement.knowledge.heardFromId).toBe('guard')
    expect(history.knownReputation('mira', city, 'actor')).toEqual(score)
    expect(history.relationship('mira', 'actor')).toEqual(relation)
    expect(history.communityReputation(city, 'actor')).toEqual(community)
})

it('withholds when the eyewitness declines and cannot leak a privately settled trade', () => {
    const { history } = fixture((_, request) =>
        request.trigger === 'report_news' ? 'ignore' : 'believe'
    )
    history.noteMeeting('merchant', 'mira')
    history.record(theft(), ['merchant'])
    expect(history.share(encounter('merchant', 'mira'), 20)).toEqual({
        status: 'withheld',
    })
    expect(history.knownIncidents('mira', city)).toEqual([])
    const publicTrade = { ...theft('trade'), kind: 'honest_exchange' } as const
    const trade: SocialIncident = { ...publicTrade, visibility: 'participants' }
    const before = history.relationship('merchant', 'actor')
    const reputation = history.communityReputation(city, 'actor')
    expect(history.record(trade, ['merchant', 'mira'])).toBe(true)
    expect(history.record(publicTrade, ['merchant', 'mira'])).toBe(false)
    expect(history.relationship('merchant', 'actor').trust).toBeGreaterThan(
        before.trust
    )
    expect(history.knownIncidents('mira', city)).toEqual([])
    expect(history.communityReputation(city, 'actor')).toEqual(reputation)
    expect(history.nextEncounter(city)).toBeUndefined()
    expect(history.share(encounter('merchant', 'mira', trade.id), 21)).toEqual({
        status: 'unavailable',
    })
})

it('resets the real-time timer when occupied and calculates one round without a cascade or backlog', () => {
    const { history } = fixture()
    history.noteMeeting('merchant', 'mira')
    history.noteMeeting('mira', 'smith')
    history.record(theft(), ['merchant'])
    expect(history.advanceBackground(city, false, 0)).toBeUndefined()
    expect(history.advanceBackground(city, false, 179_999)).toBeUndefined()
    expect(history.advanceBackground(city, true, 180_000)).toBeUndefined()
    expect(history.advanceBackground(city, false, 200_000)).toBeUndefined()
    expect(history.advanceBackground(city, false, 300_000)).toBeUndefined()
    const first = history.advanceBackground(city, false, 500_000, 20)
    expect(first).toHaveLength(1)
    const heard = told(first?.[0])
    expect(history.knownIncidents('mira', city)).toEqual([heard.knowledge])
    expect(history.knownIncidents('smith', city)).toEqual([])
    expect(history.overhear(heard.transmissionId, ['guard'], 20)).toEqual([])
    const second = history.advanceBackground(city, false, 50_000_000, 30)
    expect(second).toHaveLength(1)
    expect(told(second?.[0]).knowledge.heardFromId).toBe('mira')
    expect(history.advanceBackground(city, false, 50_000_000)).toBeUndefined()
})

it('uses one report rule for real meetings and quiet rounds', () => {
    const live = fixture().history
    const ambient = fixture().history
    for (const history of [live, ambient]) {
        history.noteMeeting('merchant', 'mira')
        history.record(theft(), ['merchant'])
    }
    const intended = encounter('merchant', 'mira')
    expect(live.nextEncounter(city, () => false)).toBeUndefined()
    expect(live.nextEncounter(city)).toEqual(intended)
    expect(ambient.advanceBackground(city, false, 0)).toBeUndefined()
    expect(ambient.advanceBackground(city, false, 300_000, 20)).toEqual([
        live.share(intended, 20),
    ])
    expect(ambient.knownIncidents('mira', city)).toEqual(
        live.knownIncidents('mira', city)
    )
})

it('uses about ten-percent deterministic distortion and cannot exceed one severity step', () => {
    const { history } = fixture()
    history.noteMeeting('merchant', 'mira')
    history.noteMeeting('mira', 'smith')
    const count = 1000
    let altered = 0
    for (let i = 0; i < count; i++) {
        const incident = theft(`distortion-${String(i)}`)
        history.record(incident, ['merchant'])
        const first = told(
            history.share(encounter('merchant', 'mira', incident.id), 20)
        )
        const second = told(
            history.share(encounter('mira', 'smith', incident.id), 30)
        )
        if (first.incident.severity !== incident.severity) {
            altered++
        }
        expect(
            Math.abs(second.incident.severity - incident.severity)
        ).toBeLessThanOrEqual(1)
        expect(second.incident).toMatchObject({
            kind: incident.kind,
            actorId: incident.actorId,
            targetId: incident.targetId,
        })
    }
    expect(altered / count).toBeGreaterThan(0.075)
    expect(altered / count).toBeLessThan(0.125)
})
