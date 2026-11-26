import type { AgentDecision } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { memoryForCharacter } from '../src/ai/characterMinds'
import { npcCommandProblem } from '../src/ai/commandValidation'
import { defaultNpcAiSettings } from '../src/ai/config'
import { NpcAiDiagnostics } from '../src/ai/diagnostics'
import { createNpcAiState } from '../src/ai/runtimeState'
import { NpcAiExecution } from '../src/ai/sessionExecution'
import { GameCharacter } from '../src/game/character'
import { CompanionService } from '../src/game/companions'
import type { GameRoom } from '../src/game/room'
import {
    controlledNpcProvider,
    npcReply,
    npcRuntimeFixture,
} from './npcAiRuntimeFixture'
import { nearbyScenarioPoint } from './scenarioRoomHelpers'

const fixtures: Array<ReturnType<typeof npcRuntimeFixture>> = []
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

function pausedContinuation() {
    const actor = new GameCharacter({
        id: 'npc',
        nickname: 'NPC',
        archetype: 'human',
        controllerKind: 'scripted',
        spawnPosition: { x: 80, y: 80 },
    })
    const state = createNpcAiState(
        {
            actorId: actor.id,
            role: 'companion',
            settings: defaultNpcAiSettings,
        },
        actor
    )
    state.task = {
        id: 'accepted-errand',
        requesterId: 'player',
        request: 'Проведи к полям.',
        language: 'ru',
        steps: 2,
    }
    const navigationFor = vi.fn()
    const room = {
        social: {
            isDecision: (decision: AgentDecision) =>
                decision.type.startsWith('exchange_'),
            exchanges: { isPaused: () => true },
            reportNpcRequestStatus: vi.fn(),
        },
        publishEvents: vi.fn(),
        navigationFor,
    } as unknown as GameRoom
    return {
        actor,
        state,
        room,
        navigationFor,
        companions: new CompanionService(),
    }
}

it.each<AgentDecision>([
    { type: 'move_to', target: { x: 144, y: 80 } },
    { type: 'guide', targetKey: 'location:map-1-2' },
])(
    'rejects a paused continuation before its promise and command: $type',
    async (decision) => {
        const f = pausedContinuation()
        const reply = npcReply(decision, { taskAcceptance: 'none' })
        const problem = npcCommandProblem(
            f.room,
            f.companions,
            f.state,
            reply,
            1000
        )
        expect(problem?.code).toBe('command_unavailable')
        expect(problem?.reason?.code).toBe('exchange')
        const diagnostics = new NpcAiDiagnostics({
            sink: () => Promise.resolve(),
        })
        const execution = new NpcAiExecution(
            f.room,
            f.companions,
            diagnostics,
            () => 'action-receipt',
            vi.fn()
        )
        execution.execute(f.state, f.actor, reply, decision, 1000)
        expect(f.state.guide).toBeUndefined()
        expect(f.state.pending).toBeUndefined()
        expect(f.actor.hasPath()).toBe(false)
        expect(f.navigationFor).not.toHaveBeenCalled()
        expect(f.state.events).toContainEqual(
            expect.objectContaining({
                kind: 'action',
                status: 'failed',
                decision,
                reason: 'Сначала нужно завершить текущий обмен.',
            })
        )
        await diagnostics.flush()
    }
)

it.each<AgentDecision>([
    { type: 'speak', text: 'Обсудим обмен.' },
    { type: 'exchange_answer', exchangeId: 'exchange', accept: true },
])(
    'allows speech and exchange decisions during a paused continuation: $type',
    (decision) => {
        const f = pausedContinuation()
        expect(
            npcCommandProblem(
                f.room,
                f.companions,
                f.state,
                npcReply(decision),
                1000
            )
        ).toBeUndefined()
    }
)

it('corrects an in-flight continuation when an exchange starts before commit', async () => {
    const provider = controlledNpcProvider()
    const f = npcRuntimeFixture(provider.decide, { cityOnly: true })
    fixtures.push(f)
    const target = nearbyScenarioPoint(f.room, f.actor)
    f.talk('Дойди до точки и расскажи, что дальше.')
    await f.advance(50)
    provider.turns[0]?.resolve(
        npcReply(
            { type: 'move_to', target },
            { taskAcceptance: 'accept', done: false }
        )
    )
    await f.advance(3000)
    expect(provider.turns[1]?.context.task?.requesterId).toBe(f.alice.actor.id)
    expect(
        provider.turns[1]?.context.events.some(
            (event) => event.kind === 'message'
        )
    ).toBe(false)
    f.alice.send({ type: 'move_to', target: { ...f.actor.position } })
    await f.advance(1500)
    f.alice.send({ type: 'exchange_invite', targetId: f.actor.id })
    const exchangeId = f.room.social.exchanges.snapshot(f.actor.id)?.id ?? ''
    const answer = f.room.social.decide(
        f.actor,
        { type: 'exchange_answer', exchangeId, accept: true },
        Date.now()
    )
    expect(answer.accepted).toBe(true)
    expect(f.room.social.exchanges.isPaused(f.actor.id)).toBe(true)
    provider.turns[1]?.resolve(
        npcReply(
            { type: 'move_to', target },
            {
                speech: 'Иду к следующей точке.',
                memory: 'Обещал идти во время обмена.',
                done: false,
            }
        )
    )
    await f.advance(100)
    expect(provider.turns[2]?.context.replyCorrection?.reason?.code).toBe(
        'exchange'
    )
    expect(f.speech().map((event) => event.text)).not.toContain(
        'Иду к следующей точке.'
    )
    expect(
        f.room.social.whispers
            .snapshot(f.alice.actor, Date.now(), f.actor.id)
            ?.messages.map((message) => message.text)
    ).not.toContain('Иду к следующей точке.')
    expect(
        JSON.stringify(
            memoryForCharacter(f.actor).context(f.alice.actor.id, 'идти')
        )
    ).not.toContain('Обещал идти во время обмена')
    expect(f.actor.hasPath()).toBe(false)
    provider.turns[2]?.resolve(
        npcReply(null, { speech: 'Сначала закончим обмен.', done: false })
    )
    await f.advance(100)
    expect(
        f.room.social.whispers
            .snapshot(f.alice.actor, Date.now(), f.actor.id)
            ?.messages.map((message) => message.text)
    ).toContain('Сначала закончим обмен.')
})
