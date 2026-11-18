import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { memoryForCharacter } from '../src/ai/characterMinds'
import { npcAssistanceContext } from '../src/ai/dialogueOrders'
import { CompanionService } from '../src/game/companions'
import { GameRoom } from '../src/game/room'
import {
    approachNpcAi,
    existingNpc,
    openNpcAiRoom,
    recordedNpcAiProvider,
    waitForNpcAi,
} from './npcAiRoomHelpers'
import { npcReply } from './npcAiRuntimeFixture'
import { joinScenarioRoom } from './scenarioRoomHelpers'

const rooms: GameRoom[] = []
beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
})
afterEach(() => {
    for (const room of rooms.splice(0)) {
        room.stop()
    }
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

it('repairs a forbidden order into one generated refusal without publishing the rejected promise', async () => {
    const p = recordedNpcAiProvider((context) => {
        if (!context.events.some((e) => e.kind === 'message')) {
            return npcReply()
        }
        if (context.replyCorrection !== undefined) {
            expect(context.replyCorrection.reason?.code).toBe('cannot_follow')
            return npcReply(null, {
                speech: 'Мне нужно заниматься городом. Расскажи, что хотел показать.',
                taskAcceptance: 'decline',
                memory: 'Отказалась уходить с городских дел.',
            })
        }
        expect(context.commandCapabilities?.orders.follow).toMatchObject({
            allowed: false,
            reason: { code: 'cannot_follow' },
        })
        return npcReply(null, {
            speech: 'Уже иду за тобой!',
            taskAcceptance: 'accept',
            companionOrder: 'follow',
            memory: 'Ушла из города.',
        })
    })
    const { room } = openNpcAiRoom(p.provider, ['city_coordinator'])
    rooms.push(room)
    const player = joinScenarioRoom(room, 'Refusal player')
    const mira = existingNpc(room, 'npc_friendly_girl_1')
    await approachNpcAi(room, player, mira)
    player.sent.length = 0
    player.send({
        type: 'chat',
        targetId: mira.id,
        text: 'Можешь за мной пойти? Кое-что покажу.',
    })
    await waitForNpcAi(() =>
        player.sent.some(
            (m) =>
                m.type === 'event' &&
                m.event.text ===
                    'Мне нужно заниматься городом. Расскажи, что хотел показать.'
        )
    )
    const speech = player.sent.flatMap((m) =>
        m.type === 'event' &&
        m.event.kind === 'chat' &&
        m.event.actorId === mira.id
            ? [m.event.text]
            : []
    )
    expect(speech).toEqual([
        'Мне нужно заниматься городом. Расскажи, что хотел показать.',
    ])
    expect(
        p.contexts.filter((c) => c.events.some((e) => e.kind === 'message'))
    ).toHaveLength(2)
    expect(mira.soul.companion?.leaderId ?? null).toBeNull()
    expect(
        JSON.stringify(
            memoryForCharacter(mira).context(player.actor.id, 'город')
        )
    ).not.toContain('Ушла из города')
})

it('shared model-order validation leaves lastReply, acquaintance and consent untouched on denial', () => {
    const room = new GameRoom()
    rooms.push(room)
    const player = joinScenarioRoom(room, 'Checker player')
    const mira = existingNpc(room, 'npc_friendly_girl_1')
    player.actor.position = { ...mira.position } // Domain fixture, not a navigation acceptance check.
    const companions = new CompanionService()
    const before = structuredClone(mira.soul.companion)
    const message = {
        type: 'companion_request',
        targetId: mira.id,
        request: 'follow',
    } as const
    const preview = companions.checkOrder(
        player.actor,
        mira,
        message,
        1000,
        npcAssistanceContext(room)
    )
    const result = companions.applyModelOrder(
        player.actor,
        mira,
        message,
        1000,
        npcAssistanceContext(room)
    )
    expect(preview).toEqual(result)
    expect(result).toMatchObject({
        accepted: false,
        reason: { code: 'cannot_follow' },
    })
    expect(mira.soul.companion).toEqual(before)
    expect(companions.dialogueText(player.actor, mira)).not.toContain(
        'Помню тебя'
    )
})
