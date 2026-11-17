import type { AgentDecision, Vector2 } from '@my-game-ratata/contracts'
import { vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import { NpcAiDiagnostics } from '../src/ai/diagnostics'
import type {
    NpcAiContext,
    NpcAiModelSettings,
    NpcAiProvider,
    NpcAiReply,
    NpcAiRole,
} from '../src/ai/types'
import type { GameCharacter } from '../src/game/character'
import { loadNavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import type { joinScenarioRoom } from './scenarioRoomHelpers'

export function npcAiReply(
    decision: AgentDecision | null,
    done = false,
    memory = ''
): NpcAiReply {
    return { decision, done, memory, waitMs: 0 }
}

export function recordedNpcAiProvider(
    decide: (
        context: NpcAiContext,
        signal: AbortSignal
    ) => NpcAiReply | Promise<NpcAiReply>
) {
    const contexts: NpcAiContext[] = []
    const signals: AbortSignal[] = []
    const provider: NpcAiProvider = {
        decide: vi.fn(
            (
                context: NpcAiContext,
                _settings: NpcAiModelSettings,
                signal: AbortSignal
            ): Promise<NpcAiReply> => {
                contexts.push(context)
                signals.push(signal)
                return Promise.resolve(decide(context, signal))
            }
        ),
    }
    return { contexts, signals, provider }
}

export function openNpcAiRoom(
    provider: NpcAiProvider,
    roles: NpcAiRole[] = ['companion']
) {
    const config = parseNpcAiConfig(
        {
            npcs: roles.map((role) => ({
                actorId:
                    role === 'companion'
                        ? 'npc_magic_slime_1'
                        : 'npc_friendly_girl_1',
                role,
            })),
        },
        true
    )
    const diagnostics: string[] = []
    const room = new GameRoom(loadNavigationService(), {
        ai: {
            config,
            provider,
            clock: Date.now,
            diagnostics: new NpcAiDiagnostics({
                sink: (line) => {
                    diagnostics.push(line)
                    return Promise.resolve()
                },
            }),
        },
    })
    room.start()
    return { room, config, diagnostics }
}

export function existingNpc(
    room: GameRoom,
    id = 'npc_magic_slime_1'
): GameCharacter {
    const npc = room.getCharacter(id)
    if (npc === undefined) {
        throw new Error(`Missing NPC ${id}`)
    }
    return npc
}

export async function advanceNpcAi(milliseconds = 50): Promise<void> {
    await vi.advanceTimersByTimeAsync(milliseconds)
}

export async function waitForNpcAi(
    predicate: () => boolean,
    timeoutMs = 30_000
): Promise<void> {
    for (let elapsed = 0; elapsed < timeoutMs && !predicate(); elapsed += 100) {
        await advanceNpcAi(100)
    }
    if (!predicate()) {
        throw new Error('NPC AI condition did not complete')
    }
}

export async function approachNpcAi(
    room: GameRoom,
    player: ReturnType<typeof joinScenarioRoom>,
    npc: GameCharacter
): Promise<void> {
    player.send({ type: 'move_to', target: { ...npc.position } })
    await waitForNpcAi(
        () =>
            Math.hypot(
                player.actor.position.x - npc.position.x,
                player.actor.position.y - npc.position.y
            ) <= 40 &&
            room
                .navigationFor(player.actor)
                .hasLineOfSight(player.actor.position, npc.position)
    )
    player.send({ type: 'cancel_control' })
}

export function requestNpcAi(
    player: ReturnType<typeof joinScenarioRoom>,
    npc: GameCharacter,
    text: string
): void {
    player.send({
        type: 'companion_request',
        request: 'talk',
        targetId: npc.id,
        text,
    })
}

export function merchantErrandDecision(context: NpcAiContext): NpcAiReply {
    if (context.facts.length > 0) {
        const requester = context.observation.targets.find(
            (target) => target.id === context.task?.requesterId
        )
        if (requester !== undefined && requester.distance <= 48) {
            return npcAiReply(
                {
                    type: 'speak',
                    text: 'У Саввы есть дорожная еда. Я проверила лавку.',
                },
                true,
                'Проверила ассортимент у Саввы.'
            )
        }
        const target = context.task?.lastKnownRequester?.position
        if (target === undefined) {
            throw new Error('Missing ordinary last-known return point')
        }
        return npcAiReply({ type: 'move_to', target })
    }
    const merchant = context.observation.targets.find(
        (target) => target.id === 'npc_merchant_1'
    )
    if (merchant !== undefined) {
        const interact = merchant.commands.find(
            (command) => command.type === 'interact'
        )
        return npcAiReply(
            interact ?? { type: 'move_to', target: merchant.position }
        )
    }
    const shop = context.observation.targets.find(
        (target) => target.kind === 'building' && target.name === 'Лавка Саввы'
    )
    const interior = shop?.details['interior'] as Vector2 | undefined
    if (interior === undefined) {
        throw new Error('Missing public shop landmark')
    }
    return npcAiReply({ type: 'move_to', target: interior })
}
