import type {
    CharacterSnapshot,
    GameEventPayload,
    ServerMessage,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { handleAgentRequest } from '../src/agentBridge'
import { handleAbilityCommand } from '../src/game/abilityCommands'
import type { GameCharacter } from '../src/game/character'
import {
    observeCombatEvent,
    observeCombatEvents,
} from '../src/game/combatObservation'
import { CompanionService } from '../src/game/companions'
import { advancePrayerCast } from '../src/game/prayer'
import {
    eventFor,
    observationFixture,
    observationRoom,
    privacyRequest,
    privacyToken,
} from './combatObservationFixture'

beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.spyOn(Math, 'random').mockReturnValue(0)
})
afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

function requireActor(actor: GameCharacter | undefined): GameCharacter {
    if (actor === undefined) {
        throw new Error('Expected actor')
    }
    return actor
}
function receivedEvents(messages: ServerMessage[]): GameEventPayload[] {
    return messages.flatMap((message) =>
        message.type === 'event' ? [message.event] : []
    )
}
function receivedSnapshot(messages: ServerMessage[]): WorldSnapshot {
    const message = messages.findLast((entry) => entry.type === 'snapshot')
    if (message === undefined) {
        throw new Error('Expected serialized snapshot')
    }
    return message.snapshot
}

function expectOwnerSegments(owner: CharacterSnapshot | undefined): void {
    const segmented = {
        kind: 'percent',
        percent: 40,
        segments: [40, 20, 20, 20],
        needsRestoration: true,
    }
    expect(owner?.health).toEqual(segmented)
    expect(owner?.resources.energy).toEqual({ ...segmented, hasCapacity: true })
}

it('sends the failed prayer caption only to the caster and strips the audience', () => {
    const { room, join } = observationRoom()
    const owner = join('Caster')
    const foreign = join('Observer')
    const anonymous = join()
    const actor = requireActor(owner.actor)
    actor.abilities.known.add('pray')
    actor.hp -= 10
    try {
        const started = handleAbilityCommand(
            actor,
            {
                type: 'use_ability',
                abilityId: 'pray',
                intent: { mode: 'restore', targetId: actor.id },
            },
            room.abilityContextFor(actor, 1000)
        )
        const at = actor.abilities.casting?.completesAt
        if (at === undefined) {
            throw new Error('Expected prayer channel')
        }
        room.publishEvents([
            ...started,
            ...advancePrayerCast(
                actor,
                at,
                room.abilityContextFor(actor, at),
                () => 1
            ),
        ])
        const unanswered = (messages: ServerMessage[]) =>
            receivedEvents(messages).filter(
                (event) => event.noticeKind === 'prayer_unanswered'
            )
        expect(unanswered(owner.messages)).toEqual([
            {
                kind: 'notice',
                noticeKind: 'prayer_unanswered',
                actorId: actor.id,
                abilityId: 'pray',
                text: 'Божество не ответило',
                textMessage: { key: 'authored.combat.prayerUnanswered' },
            },
        ])
        expect(unanswered(foreign.messages)).toEqual([])
        expect(unanswered(anonymous.messages)).toEqual([])
    } finally {
        room.stop()
    }
})

describe('serialized WebSocket combat privacy', () => {
    it('projects joined snapshots and combat events without streaming unjoined state', () => {
        vi.useFakeTimers()
        const { room, join } = observationRoom()
        const owner = join('Privacy owner')
        const foreign = join('Privacy observer')
        const anonymous = join()
        const actor = requireActor(owner.actor)
        actor.hp = actor.maxHp * 0.375
        actor.energy = actor.config.resources.maxEnergy * 0.375
        actor.abilities.barrier = {
            expiresAt: Date.now() + 5000,
            practiced: false,
        }
        const events = [
            eventFor(actor),
            eventFor(actor, 'heal'),
            eventFor(actor, 'absorb'),
        ]
        room.publishEvents(events)
        room.start()
        try {
            vi.advanceTimersByTime(50)
            const own = receivedSnapshot(owner.messages).characters.find(
                (entry) => entry.id === actor.id
            )
            expectOwnerSegments(own)
            expect(own?.abilities?.barrier).not.toHaveProperty('remaining')
            expect(own?.resourceChecks).toBeDefined()
            const snapshot = receivedSnapshot(foreign.messages)
            const target = snapshot.characters.find(
                (entry) => entry.id === actor.id
            )
            expect(target?.health).toEqual({ kind: 'percent', percent: 37 })
            expect(target?.resources).toEqual({
                mana: { kind: 'percent', percent: 100, hasCapacity: true },
                energy: { kind: 'percent', percent: 37, hasCapacity: true },
            })
            expect(target).not.toHaveProperty('resourceChecks')
            expect(JSON.stringify(target)).not.toMatch(
                /"(?:current|maxMana|maxEnergy)"/
            )
            expect(target?.abilities?.barrier).not.toHaveProperty('remaining')
            expect(
                anonymous.messages.some(
                    (message) =>
                        message.type === 'snapshot' ||
                        message.type === 'world_init'
                )
            ).toBe(false)
            for (const observer of [foreign, anonymous]) {
                const relevant = receivedEvents(observer.messages).filter(
                    (event) => event.targetId === actor.id
                )
                expect(relevant).toHaveLength(3)
                expect(JSON.stringify(relevant)).not.toContain('"amount"')
                expect(relevant[0]?.hitQuality).toBe('strong')
            }
            expect(
                receivedEvents(owner.messages).find(
                    (event) => event.kind === 'heal'
                )?.amount
            ).toBeUndefined()
            expect(events.every((event) => event.amount === 7.25)).toBe(true)
            const observerActor = requireActor(foreign.actor)
            observerActor.exactCombatNumbers = true
            room.publishEvents(events)
            vi.advanceTimersByTime(50)
            const revealed = receivedSnapshot(foreign.messages).characters.find(
                (entry) => entry.id === actor.id
            )
            expect(revealed?.health.kind).toBe('exact')
            expect(revealed?.resources).toMatchObject({
                mana: { kind: 'exact' },
                energy: { kind: 'exact' },
            })
            expect(revealed).not.toHaveProperty('resourceChecks')
            expect(revealed?.abilities?.barrier).not.toHaveProperty('remaining')
            expect(
                receivedEvents(foreign.messages).findLast(
                    (event) => event.kind === 'damage'
                )?.amount
            ).toBe(7.25)
            observerActor.exactCombatNumbers = false
            vi.advanceTimersByTime(50)
            const hiddenAgain = receivedSnapshot(
                foreign.messages
            ).characters.find((entry) => entry.id === actor.id)
            expect(hiddenAgain?.health.kind).toBe('percent')
            expect(hiddenAgain?.resources).toMatchObject({
                mana: { kind: 'percent' },
                energy: { kind: 'percent' },
            })
        } finally {
            room.stop()
        }
    })
})

describe('serialized agent bridge combat privacy', () => {
    it('keeps anonymous and NPC snapshots public until server capability is granted', async () => {
        const { room } = observationRoom()
        try {
            const publicResponse = await handleAgentRequest(
                privacyRequest('/agent/state'),
                room,
                privacyToken
            )
            const publicState = (await publicResponse.json()) as WorldSnapshot
            expect(
                publicState.characters.every(
                    (actor) => actor.health.kind === 'percent'
                )
            ).toBe(true)
            expect(JSON.stringify(publicState)).not.toContain('"current"')
            const actor = requireActor(room.getCharacter('npc_cleric_1'))
            const response = await handleAgentRequest(
                privacyRequest(`/agent/state?actorId=${actor.id}`),
                room,
                privacyToken
            )
            const state = (await response.json()) as WorldSnapshot
            expect(
                state.characters.find((entry) => entry.id === actor.id)?.health
                    .kind
            ).toBe('percent')
            expect(
                state.characters.find((entry) => entry.id === actor.id)
                    ?.resourceChecks
            ).toBeDefined()
            expect(JSON.stringify(state)).not.toMatch(
                /"(?:current|maxMana|maxEnergy)":-?\d/
            )
            expect(
                state.characters
                    .filter((entry) => entry.id !== actor.id)
                    .every((entry) => entry.health.kind === 'percent')
            ).toBe(true)
            const dummyId = 'test:training:dummy'
            const denied = await handleAgentRequest(
                privacyRequest(`/agent/state?actorId=${dummyId}`),
                room,
                privacyToken
            )
            expect(denied.status).toBe(400)
            actor.exactCombatNumbers = true
            const privileged = await handleAgentRequest(
                privacyRequest(`/agent/state?actorId=${actor.id}`),
                room,
                privacyToken
            )
            const privilegedState = (await privileged.json()) as WorldSnapshot
            expect(
                privilegedState.characters.every(
                    (entry) =>
                        entry.resources.mana.kind === 'exact' &&
                        entry.resources.energy.kind === 'exact'
                )
            ).toBe(true)
            expect(
                privilegedState.characters.every(
                    (entry) => entry.health.kind === 'exact'
                )
            ).toBe(true)
        } finally {
            room.stop()
        }
    })
})

describe('serialized agent combat action results', () => {
    it.each([false, true])(
        'projects ordinary agent prayer results with exact capability %s',
        async (exact) => {
            const { room } = observationRoom()
            try {
                const actor = requireActor(room.getCharacter('npc_veteran_1'))
                const target = requireActor(room.getCharacter('npc_princess_1'))
                actor.position = { x: 400, y: 400 }
                target.position = { ...actor.position }
                actor.exactCombatNumbers = exact
                actor.abilities.known.add('pray')
                actor.progression.patron = 'hearth'
                target.hp -= 15
                const before = target.hp
                const response = await handleAgentRequest(
                    privacyRequest('/agent/act', {
                        actorId: actor.id,
                        decision: {
                            type: 'use_ability',
                            abilityId: 'pray',
                            intent: { mode: 'restore', targetId: target.id },
                        },
                    }),
                    room,
                    privacyToken
                )
                expect(
                    response.status,
                    JSON.stringify(await response.clone().json())
                ).toBe(200)
                const body = (await response.json()) as {
                    events: GameEventPayload[]
                }
                expect(body.events).toContainEqual(
                    expect.objectContaining({ kind: 'cast', phase: 'started' })
                )
                expect(target.hp).toBe(before)
                const at = actor.abilities.casting?.completesAt
                if (at === undefined) {
                    throw new Error('Expected prayer channel')
                }
                const completed = advancePrayerCast(
                    actor,
                    at,
                    room.abilityContextFor(actor, at),
                    () => 0
                )
                const projected = observeCombatEvents(completed, {
                    observer: actor,
                    getCharacter: (id) => room.getCharacter(id),
                    navigation: room.navigationFor(actor),
                    now: at,
                })
                const serialized = JSON.parse(
                    JSON.stringify(projected)
                ) as GameEventPayload[]
                const heal = serialized.find((event) => event.kind === 'heal')
                expect(heal).toBeDefined()
                expect(target.hp).toBeGreaterThan(before)
                expect(heal?.amount).toBe(
                    exact ? target.hp - before : undefined
                )
                expect(heal).not.toHaveProperty('audienceIds')
            } finally {
                room.stop()
            }
        }
    )

    it('checks the actual five-second model lease deadline before revealing a dummy hit', () => {
        const { room } = observationRoom()
        const { dummy, view } = observationFixture()
        const observer = requireActor(room.getCharacter('npc_veteran_1'))
        observer.position = { x: 100, y: 100 }
        const companions = new CompanionService()
        expect(
            companions.decide(
                observer,
                { type: 'speak', text: 'Наблюдаю.' },
                room,
                1000
            ).accepted
        ).toBe(true)
        const leased = {
            ...view,
            observer,
            hasModelLease: (character: GameCharacter, now: number) =>
                companions.hasActiveLease(character, now, room),
        }
        expect(observer.connected).toBe(false)
        expect(
            observeCombatEvent(eventFor(dummy), { ...leased, now: 5999 })
                ?.amount
        ).toBe(7.25)
        expect(
            observeCombatEvent(eventFor(dummy), { ...leased, now: 6000 })
        ).not.toHaveProperty('amount')
        expect(observer.soul.controlSource).toBe('script')
        room.stop()
    })
})
