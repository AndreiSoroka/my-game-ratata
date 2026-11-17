import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { snapshotControl } from '../src/game/characterControl'
import {
    controlledNpcProvider,
    kaplyaId,
    miraId,
    npcReply,
    npcRuntimeFixture,
} from './npcAiRuntimeFixture'
import { nearbyScenarioPoint } from './scenarioRoomHelpers'

const fixtures: Array<ReturnType<typeof npcRuntimeFixture>> = []
function required<T>(value: T | undefined): T {
    if (value === undefined) {
        throw new Error('Missing expected test state')
    }
    return value
}
beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
})
afterEach(async () => {
    for (const fixture of fixtures.splice(0)) {
        fixture.room.stop()
        await fixture.diagnostics.flush()
    }
    vi.useRealTimers()
    vi.unstubAllGlobals()
})
function setup(includeMira = false, maxDecisionsPerTask = 12) {
    const provider = controlledNpcProvider()
    const fixture = npcRuntimeFixture(provider.decide, {
        includeMira,
        maxDecisionsPerTask,
    })
    fixtures.push(fixture)
    return { ...fixture, provider }
}

it('claims one ambiguous source before publishing acceptance and refuses a second acceptance', async () => {
    const f = setup(true)
    const mira = required(f.room.getCharacter(miraId))
    // Unit setup puts both possible listeners together; all subsequent actions use normal commands.
    mira.position = { ...f.actor.position }
    f.alice.send({ type: 'chat', text: 'Сходи к торговцу и вернись.' })
    await f.advance()
    const first = required(f.provider.turns[0])
    expect(first.context.actorId).toBe(kaplyaId)
    expect(first.context.events[0]).toMatchObject({
        kind: 'message',
        ambiguous: true,
    })
    first.resolve(
        npcReply(
            { type: 'move_to', target: nearbyScenarioPoint(f.room, f.actor) },
            {
                done: false,
                taskAcceptance: 'accept',
                speech: 'Буль, схожу. Жди здесь.',
            }
        )
    )
    await f.advance()
    const second = required(
        f.provider.turns.find((turn) => turn.context.actorId === miraId)
    )
    expect(second.context.events[0]).toMatchObject({
        kind: 'message',
        id: first.context.events[0]?.id,
        ambiguous: true,
    })
    second.resolve(
        npcReply(null, {
            done: false,
            taskAcceptance: 'accept',
            speech: 'Мира тоже приняла поручение.',
        })
    )
    await f.advance()
    const speeches = f.alice.sent.flatMap((message) =>
        message.type === 'event' && message.event.kind === 'chat'
            ? [message.event.text]
            : []
    )
    expect(
        speeches.filter((text) => text === 'Буль, схожу. Жди здесь.')
    ).toHaveLength(1)
    expect(speeches).not.toContain('Мира тоже приняла поручение.')
    expect(speeches).toContain(
        'Это поручение уже принято или сейчас недоступно.'
    )
})

it('answers small talk during a real route without spending its task decision budget or cancelling it', async () => {
    const f = setup(false, 2)
    f.talk('Сходи к торговцу.')
    await f.advance()
    const target = nearbyScenarioPoint(f.room, f.actor)
    required(f.provider.turns[0]).resolve(
        npcReply(
            { type: 'move_to', target },
            { done: false, taskAcceptance: 'accept' }
        )
    )
    await f.advance(50)
    expect(snapshotControl(f.actor).mode).toBe('route')
    expect(f.actor.hasPath()).toBe(true)
    f.alice.send({ type: 'chat', text: 'Спасибо! Как дела?' })
    await f.advance(50)
    const conversation = required(f.provider.turns[1])
    expect(conversation.context.task).toBeNull()
    expect(conversation.context.events[0]).toMatchObject({
        text: 'Спасибо! Как дела?',
    })
    conversation.resolve(
        npcReply(null, {
            speech: 'Буль, всё хорошо, продолжаю путь.',
            taskAcceptance: 'none',
        })
    )
    await f.advance(50)
    expect(snapshotControl(f.actor).mode).toBe('route')
    expect(f.actor.hasPath()).toBe(true)
    await f.advance(4000)
    const continuation = required(f.provider.turns[2])
    expect(continuation.context.task).toMatchObject({
        request: 'Сходи к торговцу.',
        steps: 2,
    })
    expect(continuation.context.events).toContainEqual(
        expect.objectContaining({
            kind: 'action',
            status: 'completed',
            reason: 'arrived',
        })
    )
    expect(
        f.entries().some((entry) => entry['category'] === 'task_limit')
    ).toBe(false)
    continuation.resolve(npcReply())
    await f.advance()
})

it('lets one NPC remember its own whispers in public dialogue while command scope follows the speaker', async () => {
    const f = setup()
    f.alice.send({
        type: 'whisper',
        targetId: kaplyaId,
        text: 'Только тебе: тайник под мостом.',
    })
    await f.advance()
    expect(f.provider.turns[0]?.context.events).toContainEqual(
        expect.objectContaining({
            channel: 'whisper',
            text: 'Только тебе: тайник под мостом.',
        })
    )
    required(f.provider.turns[0]).resolve(
        npcReply(null, {
            memory: 'Секрет: тайник под мостом.',
            taskAcceptance: 'none',
        })
    )
    await f.advance()
    f.alice.send({ type: 'chat', text: 'Привет всем, как город?' })
    await f.advance()
    const publicContext = required(f.provider.turns[1]).context
    expect(publicContext.task).toBeNull()
    expect(publicContext.memory).toBe('')
    expect(publicContext.observation.social?.whisper?.partnerId).toBe(
        f.alice.actor.id
    )
    expect(JSON.stringify(publicContext.conversation)).toContain(
        'тайник под мостом'
    )
    required(f.provider.turns[1]).resolve(
        npcReply(null, { memory: 'Публичная беседа.', taskAcceptance: 'none' })
    )
    await f.advance()
    f.alice.send({
        type: 'whisper',
        targetId: kaplyaId,
        text: 'Помнишь мой секрет?',
    })
    await f.advance()
    expect(f.provider.turns[2]?.context.memory).toBe(
        'Секрет: тайник под мостом.'
    )
})
