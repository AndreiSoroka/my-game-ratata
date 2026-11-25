import type { AgentDecision, GameEventPayload } from '@my-game-ratata/contracts'
import { vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import { NpcAiDiagnostics } from '../src/ai/diagnostics'
import type { NpcAiContext, NpcAiProvider, NpcAiReply } from '../src/ai/types'
import { distance } from '../src/game/math'
import { GameRoom } from '../src/game/room'
import { joinScenarioRoom } from './scenarioRoomHelpers'

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
        actorId?: string
        maxDecisionsPerTask?: number
        maxCallsPerMinute?: number
        maxCallsPer10Minutes?: number
        maxCallsPerHour?: number
        timeoutMs?: number
        includeMira?: boolean
    } = {}
) {
    const actorId = limits.actorId ?? kaplyaId
    const lines: string[] = []
    const diagnostics = new NpcAiDiagnostics({
        sink: (line) => {
            lines.push(line)
            return Promise.resolve()
        },
    })
    const config = parseNpcAiConfig(
        {
            proactive: limits.includeMira === true,
            defaults: { timeoutMs: limits.timeoutMs ?? 10_000 },
            limits: {
                maxDecisionsPerTask: limits.maxDecisionsPerTask ?? 12,
                maxCallsPerMinute: limits.maxCallsPerMinute,
                maxCallsPer10Minutes: limits.maxCallsPer10Minutes,
                maxCallsPerHour: limits.maxCallsPerHour,
                retryDelayMs: 500,
                reviewIntervalMs: 60_000,
            },
            npcs: [
                { actorId, role: 'companion' },
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
    const actor = room.getCharacter(actorId)
    if (actor === undefined) {
        throw new Error(`Missing NPC fixture ${actorId}`)
    }
    // Arrange initial contact at the first reachable tile of the ordinary approach.
    // Each test still submits its conversation, follow, guide or travel commands through the socket.
    const navigation = room.navigationFor(alice.actor)
    const contact = navigation
        .findPathWorld(alice.actor.position, actor.position)
        .find(
            (point) =>
                distance(point, actor.position) <= 36 &&
                navigation.hasLineOfSight(point, actor.position)
        )
    if (contact === undefined) {
        throw new Error(`${actorId} has no reachable conversation point`)
    }
    alice.actor.position = { ...contact }
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
                targetId: actorId,
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
