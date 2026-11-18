import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { memoryForCharacter } from '../src/ai/characterMinds'
import type { GameRoom } from '../src/game/room'
import { openNpcAiRoom, recordedNpcAiProvider } from './npcAiRoomHelpers'
import {
    controlledNpcProvider,
    npcReply,
    npcRuntimeFixture,
} from './npcAiRuntimeFixture'
import { approachScenarioNpc, joinScenarioRoom } from './scenarioRoomHelpers'

const rooms: GameRoom[] = []
beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
})
afterEach(() => {
    rooms.splice(0).forEach((room) => room.stop())
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function setup() {
    const provider = controlledNpcProvider()
    const f = npcRuntimeFixture(provider.decide)
    rooms.push(f.room)
    return { ...f, provider }
}

it('repairs unmistakable self-agreement before consent, speech and memory are committed', async () => {
    const f = setup()
    const wrong = 'Я готова пойти с тобой.'
    f.talk('Пойдём со мной.')
    await f.advance()
    f.provider.turns[0]?.resolve(
        npcReply(null, {
            taskAcceptance: 'accept',
            companionOrder: 'follow',
            speech: wrong,
            memory: 'Я согласилась и пошла за этим путником.',
        })
    )
    await f.advance()
    expect(f.provider.turns).toHaveLength(2)
    expect(f.provider.turns[1]?.context.replyCorrection?.reason?.code).toBe(
        'speech_self_reference'
    )
    expect(f.provider.turns[1]?.context.replyCorrection?.draftSpeech).toBe(
        wrong
    )
    expect(f.actor.soul.companion?.leaderId).toBeNull()
    expect(f.speech().some((event) => event.text === wrong)).toBe(false)
    expect(JSON.stringify(memoryForCharacter(f.actor).entries())).not.toContain(
        wrong
    )
    const valid = 'Пойду с тобой.'
    f.provider.turns[1]?.resolve(
        npcReply(null, {
            taskAcceptance: 'accept',
            companionOrder: 'follow',
            speech: valid,
            memory: 'Согласилось идти рядом.',
        })
    )
    await f.advance()
    expect(f.actor.soul.companion?.leaderId).toBe(f.alice.actor.id)
    expect(f.speech().filter((event) => event.text === valid)).toHaveLength(1)
    expect(JSON.stringify(memoryForCharacter(f.actor).entries())).not.toContain(
        wrong
    )
})

it('exhausts the shared two-call limit without speaking, acting or retrying an invalid input', async () => {
    const f = setup()
    f.talk('Пойдём вместе.')
    await f.advance()
    for (const index of [0, 1]) {
        f.provider.turns[index]?.resolve(
            npcReply(null, {
                taskAcceptance: 'accept',
                companionOrder: 'follow',
                speech: 'Я готова пойти.',
                memory: 'Неверное согласие.',
            })
        )
        await f.advance()
    }
    await f.advance(1000)
    expect(f.provider.turns).toHaveLength(2)
    expect(f.actor.soul.companion?.leaderId).toBeNull()
    expect(f.speech().some((event) => event.text === 'Я готова пойти.')).toBe(
        false
    )
    expect(JSON.stringify(memoryForCharacter(f.actor).entries())).not.toContain(
        'Неверное согласие.'
    )
})

it('uses the same repair gate for an actual unsolicited greeting and records only delivered speech', async () => {
    const valid = 'Привет! Я Капля.'
    const recorded = recordedNpcAiProvider((context) =>
        npcReply(null, {
            taskAcceptance: 'none',
            speech:
                context.replyCorrection === undefined
                    ? 'Привет! Рада знакомству.'
                    : valid,
            memory: 'Начало знакомства.',
        })
    )
    const { room, config } = openNpcAiRoom(recorded.provider)
    rooms.push(room)
    config.proactive = true
    const player = joinScenarioRoom(room, 'Greeting grammar guest')
    const actor = approachScenarioNpc(room, player, 'npc_magic_slime_1')
    await vi.advanceTimersByTimeAsync(500)
    expect(recorded.contexts).toHaveLength(2)
    expect(recorded.contexts[0]?.socialOpportunity?.kind).toBe('greeting')
    expect(recorded.contexts[1]?.replyCorrection?.reason?.code).toBe(
        'speech_self_reference'
    )
    const spoken = player.sent.flatMap((message) =>
        message.type === 'event' &&
        message.event.kind === 'chat' &&
        message.event.actorId === actor.id
            ? [message.event.text]
            : []
    )
    expect(spoken).toEqual([valid])
    expect(JSON.stringify(memoryForCharacter(actor).entries())).not.toContain(
        'Рада знакомству'
    )
})

it('does not transfer the NPC grammatical reference onto its actual human listener', async () => {
    const f = setup()
    f.talk('Привет!')
    await f.advance()
    f.provider.turns[0]?.resolve(
        npcReply(null, { speech: 'Привет! Хорошо, что ты заглянуло.' })
    )
    await f.advance()
    expect(f.provider.turns).toHaveLength(2)
    expect(f.provider.turns[1]?.context.replyCorrection?.reason?.code).toBe(
        'speech_addressee_reference'
    )
    expect(f.speech()).toHaveLength(0)
    f.provider.turns[1]?.resolve(
        npcReply(null, { speech: 'Привет! Как дела?' })
    )
    await f.advance()
    expect(f.speech().map((event) => event.text)).toEqual(['Привет! Как дела?'])
})
