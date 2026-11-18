import type { AgentDecision } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { memoryForCharacter } from '../src/ai/characterMinds'
import type { NpcAiContext, NpcAiReply } from '../src/ai/types'
import type { GameRoom } from '../src/game/room'
import {
    advanceNpcAi,
    approachNpcAi,
    existingNpc,
    openNpcAiRoom,
    recordedNpcAiProvider,
    waitForNpcAi,
} from './npcAiRoomHelpers'
import { joinScenarioRoom } from './scenarioRoomHelpers'

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

const answer = (
    decision: AgentDecision | null = null,
    speech: string | null = null
): NpcAiReply => ({
    decision,
    speech,
    memory: '',
    done: true,
    waitMs: 0,
    taskAcceptance: 'none',
    companionOrder: null,
})
const selfActivities = (contexts: NpcAiContext[]) =>
    contexts.filter((context) => context.task?.background === 'self_activity')

it('starts one peaceful activity after five idle minutes and finishes real shared movement before another idle interval', async () => {
    let chosen: Extract<AgentDecision, { type: 'move_to' }> | undefined
    const recorded = recordedNpcAiProvider((context) => {
        if (context.socialOpportunity !== undefined) {
            return answer(null, 'Привет! Хорошо, что ты здесь.')
        }
        if (context.task?.background !== 'self_activity') {
            return answer()
        }
        const actor = room.getCharacter(context.observation.self.id)
        if (actor === undefined) {
            throw new Error('Missing ordinary autonomous actor')
        }
        const navigation = room.navigationFor(actor)
        const target = context.observation.targets
            .filter(
                (entry) => entry.kind === 'building' && entry.distance >= 48
            )
            .sort((a, b) => a.distance - b.distance)
            .find(
                (entry) =>
                    navigation.findPathWorld(actor.position, entry.position)
                        .length > 0
            )
        const command = target?.commands.find(
            (entry) =>
                entry.type === 'move_to' &&
                entry.target.x === target.position.x &&
                entry.target.y === target.position.y
        )
        if (command?.type !== 'move_to') {
            throw new Error('Missing observed reachable place to visit')
        }
        chosen = command
        return answer(command)
    })
    const { room, config, diagnostics } = openNpcAiRoom(recorded.provider)
    rooms.push(room)
    config.proactive = true
    const player = joinScenarioRoom(room, 'Idle Observer')
    const npc = existingNpc(room)
    await approachNpcAi(room, player, npc)
    await waitForNpcAi(
        () =>
            memoryForCharacter(npc).lastConversationAt(player.actor.id) !==
            undefined
    )
    const firstAt = memoryForCharacter(npc).lastConversationAt(player.actor.id)
    if (firstAt === undefined) {
        throw new Error('First greeting did not finish')
    }
    const start = { ...npc.position }
    vi.setSystemTime(firstAt + 299_000)
    await advanceNpcAi(250)
    expect(selfActivities(recorded.contexts)).toHaveLength(0)
    expect(npc.position).toEqual(start)

    vi.setSystemTime(firstAt + 300_000)
    await waitForNpcAi(() => selfActivities(recorded.contexts).length === 1)
    const activity = selfActivities(recorded.contexts)[0]
    expect(activity?.task).toMatchObject({
        requesterId: null,
        background: 'self_activity',
    })
    expect(activity?.observation.serverTime).toBeGreaterThanOrEqual(
        firstAt + 300_000
    )
    expect(activity?.events.some((event) => event.kind === 'message')).toBe(
        false
    )
    await waitForNpcAi(
        () =>
            diagnostics.some(
                (entry) =>
                    entry.includes('"category":"action_completed"') &&
                    entry.includes('"type":"move_to"') &&
                    entry.includes('"reason":"arrived"')
            ) && !npc.hasPath()
    )
    expect(chosen).toBeDefined()
    expect(npc.position).not.toEqual(start)
    expect(npc.position).toEqual(chosen?.target)
    expect(selfActivities(recorded.contexts)).toHaveLength(1)
    const completedAt = Date.now()
    vi.setSystemTime(completedAt + 299_000)
    await advanceNpcAi(250)
    expect(selfActivities(recorded.contexts)).toHaveLength(1)
    expect(
        diagnostics.filter((entry) =>
            entry.includes('"category":"action_completed"')
        )
    ).toHaveLength(1)
})
