import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { NpcAiReply } from '../src/ai/types'
import type { GameRoom } from '../src/game/room'
import {
    advanceNpcAi,
    approachNpcAi,
    existingNpc,
    merchantErrandDecision,
    npcAiReply,
    openNpcAiRoom,
    recordedNpcAiProvider,
    requestNpcAi,
    waitForNpcAi,
} from './npcAiRoomHelpers'
import { joinScenarioRoom } from './scenarioRoomHelpers'

const rooms: GameRoom[] = []
beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
})
afterEach(async () => {
    for (const room of rooms.splice(0)) {
        room.stop()
    }
    await Promise.resolve()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

it('physically visits the merchant, learns earned stock, returns and privately reports after action receipts', async () => {
    const recorded = recordedNpcAiProvider(merchantErrandDecision)
    const { room } = openNpcAiRoom(recorded.provider)
    rooms.push(room)
    const alice = joinScenarioRoom(room, 'Alice')
    const bob = joinScenarioRoom(room, 'Bob')
    const kaplya = existingNpc(room)
    await approachNpcAi(room, alice, kaplya)
    const origin = { ...kaplya.position }
    requestNpcAi(
        alice,
        kaplya,
        'Сходи к Савве, узнай ассортимент и вернись ко мне.'
    )
    await waitForNpcAi(() =>
        alice.sent.some(
            (message) =>
                message.type === 'event' &&
                message.event.text ===
                    'У Саввы есть дорожная еда. Я узнало это в лавке.'
        )
    )
    expect(recorded.contexts).toHaveLength(4)
    expect(recorded.contexts[0]?.observation.market).toBeUndefined()
    expect(recorded.contexts[0]?.facts).toEqual([])
    const receipts = recorded.contexts
        .flatMap((context) => context.events)
        .filter((event) => event.kind === 'action')
    expect(
        receipts.map((event) => [
            event.decision.type,
            event.status,
            event.reason,
        ])
    ).toEqual([
        ['move_to', 'completed', 'arrived'],
        ['interact', 'completed', 'resolved'],
        ['move_to', 'completed', 'arrived'],
    ])
    expect(new Set(receipts.map((event) => event.id)).size).toBe(
        receipts.length
    )
    const learned = recorded.contexts.find((context) =>
        context.facts.some((fact) => fact.kind === 'merchant')
    )
    expect(
        learned?.facts.find((fact) => fact.kind === 'merchant')
    ).toMatchObject({
        kind: 'merchant',
        merchantId: 'npc_merchant_1',
    })
    expect(
        learned?.facts.find((fact) => fact.kind === 'merchant')?.offers
    ).toMatchObject({
        cityId: CENTER_LOCATION_ID,
    })
    expect(learned?.observation.market).toBeUndefined()
    const shopPosition = recorded.contexts[1]?.observation.self.position
    expect(
        Math.hypot(
            (shopPosition?.x ?? origin.x) - origin.x,
            (shopPosition?.y ?? origin.y) - origin.y
        )
    ).toBeGreaterThan(200)
    expect(
        Math.hypot(
            kaplya.position.x - alice.actor.position.x,
            kaplya.position.y - alice.actor.position.y
        )
    ).toBeLessThanOrEqual(48)
    expect(
        bob.sent.some(
            (message) =>
                message.type === 'event' &&
                message.event.text ===
                    'У Саввы есть дорожная еда. Я узнало это в лавке.'
        )
    ).toBe(false)
    expect(
        room
            .snapshot(Date.now(), kaplya.locationId, bob.actor.id)
            .characters.find((character) => character.id === kaplya.id)?.soul
    ).not.toHaveProperty('companion')
    expect(kaplya.soul.controlSource).toBe('script')
}, 15_000)

it('renews control while a slow model is thinking and rejects conflicting bridge commands', async () => {
    let resolve: ((reply: NpcAiReply) => void) | undefined
    const recorded = recordedNpcAiProvider(
        () =>
            new Promise<NpcAiReply>((done) => {
                resolve = done
            })
    )
    const { room } = openNpcAiRoom(recorded.provider)
    rooms.push(room)
    const player = joinScenarioRoom(room, 'Patient')
    const kaplya = existingNpc(room)
    await approachNpcAi(room, player, kaplya)
    requestNpcAi(player, kaplya, 'Как дела?')
    await waitForNpcAi(() => recorded.contexts.length === 1)
    await advanceNpcAi(6_000)
    expect(kaplya.soul.controlSource).toBe('model')
    expect(
        room.decideForAgent(kaplya.id, {
            type: 'speak',
            text: 'Чужой контроллер',
        }).accepted
    ).toBe(false)
    resolve?.(npcAiReply({ type: 'speak', text: 'Всё хорошо.' }, true))
    await waitForNpcAi(() => kaplya.soul.controlSource === 'script')
    expect(
        player.sent.some(
            (message) =>
                message.type === 'event' && message.event.text === 'Всё хорошо.'
        )
    ).toBe(true)
})

it('wakes autonomous Mira for actual city consumption before the next periodic review', async () => {
    const recorded = recordedNpcAiProvider(() => npcAiReply(null, true))
    const { room, config } = openNpcAiRoom(recorded.provider, [
        'city_coordinator',
    ])
    rooms.push(room)
    joinScenarioRoom(room, 'City activity observer')
    config.limits.reviewIntervalMs = 3_600_000
    await waitForNpcAi(() => recorded.contexts.length === 1)
    await advanceNpcAi(100)
    expect(recorded.contexts[0]?.events[0]).toMatchObject({
        kind: 'world',
        reason: 'city_review',
    })
    const before = room
        .adventureForWorkers()
        .economy.snapshot(CENTER_LOCATION_ID, Date.now())
    vi.setSystemTime(Date.now() + 150_001)
    await waitForNpcAi(() => recorded.contexts.length > 1, 2_000)
    const changed = recorded.contexts[1]
    expect(changed?.events[0]).toMatchObject({
        kind: 'world',
        reason: 'city_changed',
    })
    expect(
        changed?.observation.city?.market?.rows.find(
            (row) => row.itemId === 'food'
        )?.consumedLast10Minutes
    ).toBeGreaterThan(
        before?.rows.find((row) => row.itemId === 'food')
            ?.consumedLast10Minutes ?? 0
    )
    const current = room
        .adventureForWorkers()
        .economy.snapshot(CENTER_LOCATION_ID, Date.now())
    expect(changed?.observation.city?.market).toEqual(current)
    expect(existingNpc(room, 'npc_friendly_girl_1').locationId).toBe(
        CENTER_LOCATION_ID
    )
})

it('records model feedback about missing mechanics with a legal alternative', async () => {
    const recorded = recordedNpcAiProvider((context) => {
        expect(
            context.observation.capabilities?.navigation.automaticEnemyAvoidance
        ).toBe(false)
        return {
            ...npcAiReply(
                {
                    type: 'speak',
                    text: 'Могу выбрать обычные точки пути по тому, что вижу.',
                },
                true
            ),
            diagnostics: [
                {
                    kind: 'missing_capability',
                    capability: 'avoid_enemies_route',
                    detail: 'No dedicated enemy-avoidance route intention is exposed to this controller.',
                    attempted:
                        'Use ordinary waypoints based on observed positions instead.',
                },
            ],
        }
    })
    const { room, diagnostics } = openNpcAiRoom(recorded.provider)
    rooms.push(room)
    const player = joinScenarioRoom(room, 'Alice')
    const kaplya = existingNpc(room)
    await approachNpcAi(room, player, kaplya)
    requestNpcAi(player, kaplya, 'Как безопаснее пройти по городу?')
    await waitForNpcAi(() =>
        diagnostics.some((line) => line.includes('avoid_enemies_route'))
    )
    expect(
        diagnostics.some(
            (line) =>
                line.includes('"category":"model_feedback"') &&
                line.includes('Как безопаснее пройти по городу?')
        )
    ).toBe(true)
    await waitForNpcAi(() => kaplya.soul.controlSource === 'script')
})
