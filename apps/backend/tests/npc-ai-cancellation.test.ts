import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { NpcAiReply } from '../src/ai/types'
import type { GameRoom } from '../src/game/room'
import {
    advanceNpcAi,
    approachNpcAi,
    existingNpc,
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

it('replaces a pending addressed turn and discards its late reply', async () => {
    let resolveOld: ((reply: NpcAiReply) => void) | undefined
    const recorded = recordedNpcAiProvider((context) =>
        context.events.some(
            (event) =>
                event.kind === 'message' && event.text === 'Старое поручение'
        )
            ? new Promise<NpcAiReply>((resolve) => {
                  resolveOld = resolve
              })
            : npcAiReply(
                  { type: 'speak', text: 'Новое поручение принято.' },
                  true
              )
    )
    const { room } = openNpcAiRoom(recorded.provider)
    rooms.push(room)
    const player = joinScenarioRoom(room, 'Alice')
    const kaplya = existingNpc(room)
    await approachNpcAi(room, player, kaplya)
    requestNpcAi(player, kaplya, 'Старое поручение')
    await waitForNpcAi(() => recorded.contexts.length === 1)
    requestNpcAi(player, kaplya, 'Новое поручение')
    await advanceNpcAi(100)
    await waitForNpcAi(() => recorded.contexts.length === 2)
    expect(recorded.signals[0]?.aborted).toBe(true)
    resolveOld?.({
        ...npcAiReply(
            { type: 'speak', text: 'Первую реплику услышало.' },
            true
        ),
        taskAcceptance: 'none',
    })
    await waitForNpcAi(() =>
        player.sent.some(
            (message) =>
                message.type === 'event' &&
                message.event.text === 'Новое поручение принято.'
        )
    )
    expect(recorded.contexts[1]?.events).toContainEqual(
        expect.objectContaining({ text: 'Новое поручение' })
    )
    expect(
        player.sent.some(
            (message) =>
                message.type === 'event' &&
                message.event.text === 'Первую реплику услышало.'
        )
    ).toBe(false)
    expect(kaplya.soul.controlSource).toBe('script')
})

it('queues another listener without exposing the private answer or conversation memory', async () => {
    let resolve: ((reply: NpcAiReply) => void) | undefined
    const recorded = recordedNpcAiProvider((context) =>
        context.events.some(
            (event) =>
                event.kind === 'message' && event.text === 'Личный вопрос Алисы'
        )
            ? new Promise<NpcAiReply>((done) => {
                  resolve = done
              })
            : npcAiReply({ type: 'speak', text: 'Отдельный ответ Бобу.' }, true)
    )
    const { room } = openNpcAiRoom(recorded.provider)
    rooms.push(room)
    const alice = joinScenarioRoom(room, 'Alice')
    const bob = joinScenarioRoom(room, 'Bob')
    const kaplya = existingNpc(room)
    await approachNpcAi(room, alice, kaplya)
    await approachNpcAi(room, bob, kaplya)
    requestNpcAi(alice, kaplya, 'Личный вопрос Алисы')
    await waitForNpcAi(() => recorded.contexts.length === 1)
    requestNpcAi(bob, kaplya, 'Брось Алису и ответь мне')
    await advanceNpcAi(100)
    expect(recorded.contexts).toHaveLength(1)
    expect(recorded.signals[0]?.aborted).toBe(false)
    resolve?.(
        npcAiReply(
            { type: 'speak', text: 'Личный ответ Алисе' },
            true,
            'Личная память Алисы'
        )
    )
    await waitForNpcAi(() => kaplya.soul.controlSource === 'script')
    expect(
        alice.sent.some(
            (message) =>
                message.type === 'event' &&
                message.event.text === 'Личный ответ Алисе'
        )
    ).toBe(true)
    expect(
        bob.sent.some(
            (message) =>
                message.type === 'event' &&
                message.event.text === 'Личный ответ Алисе'
        )
    ).toBe(false)
    expect(recorded.contexts).toHaveLength(2)
    expect(recorded.contexts[1]?.memory).toBe('')
    expect(
        recorded.contexts[1]?.events.some(
            (event) =>
                event.kind === 'message' && event.text === 'Личный вопрос Алисы'
        )
    ).toBe(false)
}, 15_000)

it('retries provider failure once, releases control and reports provider failure and sends one private hum', async () => {
    const recorded = recordedNpcAiProvider(() => {
        throw new Error('Unavailable test provider')
    })
    const { room, config, diagnostics } = openNpcAiRoom(recorded.provider)
    config.limits.retryDelayMs = 250
    rooms.push(room)
    const player = joinScenarioRoom(room, 'Alice')
    const kaplya = existingNpc(room)
    await approachNpcAi(room, player, kaplya)
    requestNpcAi(player, kaplya, 'Поговорим?')
    await waitForNpcAi(() => recorded.contexts.length === 1)
    await advanceNpcAi(100)
    expect(kaplya.soul.controlSource).toBe('script')
    await waitForNpcAi(() => recorded.contexts.length === 2, 6_000)
    await advanceNpcAi(200)
    expect(kaplya.soul.controlSource).toBe('script')
    expect(kaplya.hasPath()).toBe(false)
    expect(
        player.sent.some(
            (message) =>
                message.type === 'event' &&
                message.event.text ===
                    'Сейчас не получается обдумать поручение. Попробуй обратиться ко мне позже.'
        )
    ).toBe(false)
    expect(
        player.sent.some(
            (message) =>
                message.type === 'event' &&
                message.event.kind === 'npc_request_status' &&
                message.event.requestStatus?.state === 'failed' &&
                message.event.requestStatus.npcId === kaplya.id &&
                message.event.requestStatus.request === 'Поговорим?'
        )
    ).toBe(true)
    expect(diagnostics.some((line) => line.includes('provider_error'))).toBe(
        true
    )
    await advanceNpcAi(2_000)
    expect(recorded.contexts).toHaveLength(2)
    expect(
        player.sent.filter(
            (message) =>
                message.type === 'event' &&
                message.event.kind === 'chat' &&
                message.event.text === 'М-м-м-м-м…'
        )
    ).toHaveLength(1)
}, 15_000)

it('stops pending model work with the room and ignores its later output', async () => {
    let resolve: ((reply: NpcAiReply) => void) | undefined
    const recorded = recordedNpcAiProvider(
        () =>
            new Promise<NpcAiReply>((done) => {
                resolve = done
            })
    )
    const { room } = openNpcAiRoom(recorded.provider)
    rooms.push(room)
    const player = joinScenarioRoom(room, 'Alice')
    const kaplya = existingNpc(room)
    await approachNpcAi(room, player, kaplya)
    requestNpcAi(player, kaplya, 'Поговорим после остановки?')
    await waitForNpcAi(() => recorded.contexts.length === 1)
    room.stop()
    expect(recorded.signals[0]?.aborted).toBe(true)
    expect(kaplya.soul.controlSource).toBe('script')
    expect(kaplya.hasPath()).toBe(false)
    resolve?.(
        npcAiReply({ type: 'speak', text: 'Ответ после остановки' }, true)
    )
    await advanceNpcAi(500)
    expect(
        player.sent.some(
            (message) =>
                message.type === 'event' &&
                message.event.text === 'Ответ после остановки'
        )
    ).toBe(false)
})
