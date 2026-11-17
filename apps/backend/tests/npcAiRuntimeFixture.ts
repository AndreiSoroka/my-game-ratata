import type { AgentDecision, GameEventPayload } from '@my-game-ratata/contracts'
import { vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import { NpcAiDiagnostics } from '../src/ai/diagnostics'
import type { NpcAiContext, NpcAiProvider, NpcAiReply } from '../src/ai/types'
import { GameRoom } from '../src/game/room'
import { approachScenarioNpc, joinScenarioRoom } from './scenarioRoomHelpers'

export const kaplyaId = 'npc_magic_slime_1'
export const miraId = 'npc_friendly_girl_1'

export function controlledNpcProvider() {
    const turns: Array<{
        context: NpcAiContext
        signal: AbortSignal
        resolve: (reply: NpcAiReply) => void
    }> = []
    const decide: NpcAiProvider['decide'] = (context, _settings, signal) => {
        const { promise, resolve } = Promise.withResolvers<NpcAiReply>()
        turns.push({ context, signal, resolve })
        return promise
    }
    return { decide, turns }
}

export function npcReply(
    decision: AgentDecision | null = null,
    overrides: Partial<NpcAiReply> = {}
): NpcAiReply {
    return { decision, memory: '', done: true, waitMs: 0, ...overrides }
}

export function npcRuntimeFixture(
    decide: NpcAiProvider['decide'],
    limits: {
        maxDecisionsPerTask?: number
        maxCallsPerHour?: number
        timeoutMs?: number
        includeMira?: boolean
    } = {}
) {
    const lines: string[] = []
    const diagnostics = new NpcAiDiagnostics({
        sink: (line) => {
            lines.push(line)
            return Promise.resolve()
        },
    })
    const config = parseNpcAiConfig(
        {
            defaults: { timeoutMs: limits.timeoutMs ?? 10_000 },
            limits: {
                maxDecisionsPerTask: limits.maxDecisionsPerTask ?? 12,
                maxCallsPerHour: limits.maxCallsPerHour ?? 120,
                retryDelayMs: 500,
                reviewIntervalMs: 60_000,
            },
            npcs: [
                { actorId: kaplyaId, role: 'companion' },
                ...(limits.includeMira === true
                    ? [{ actorId: miraId, role: 'city_coordinator' }]
                    : []),
            ],
        },
        true
    )
    const room = new GameRoom(undefined, {
        ai: { config, provider: { decide }, clock: Date.now, diagnostics },
    })
    room.start()
    const alice = joinScenarioRoom(room, 'AI runtime Alice')
    const actor = approachScenarioNpc(room, alice, kaplyaId)
    return {
        room,
        actor,
        alice,
        diagnostics,
        lines,
        talk(text = 'Расскажи, как дела в городе.') {
            alice.send({
                type: 'companion_request',
                request: 'talk',
                targetId: kaplyaId,
                text,
            })
        },
        speech(): GameEventPayload[] {
            return alice.sent.flatMap((message) =>
                message.type === 'event' &&
                message.event.kind === 'chat' &&
                message.event.actorId === actor.id
                    ? [message.event]
                    : []
            )
        },
        entries(): Array<Record<string, unknown>> {
            return lines.map(
                (line) => JSON.parse(line) as Record<string, unknown>
            )
        },
        async advance(milliseconds = 100): Promise<void> {
            await vi.advanceTimersByTimeAsync(milliseconds)
        },
    }
}
