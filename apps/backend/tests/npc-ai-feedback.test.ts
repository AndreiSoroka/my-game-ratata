import { afterEach, beforeEach, expect, it, vi } from 'vitest'

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

function setup() {
    const provider = controlledNpcProvider()
    const fixture = npcRuntimeFixture(provider.decide)
    fixtures.push(fixture)
    return { ...fixture, provider }
}

it('comments on a missing mechanic and physically attempts an ordinary alternative in the same turn', async () => {
    const f = setup()
    f.talk('Обойди врагов, если можешь.')
    await f.advance()
    const before = { ...f.actor.position }
    const target = nearbyScenarioPoint(f.room, f.actor)
    const detail =
        'Автоматического обхода врагов у меня нет. Попробую доступную точку пути.'
    f.provider.turns[0]?.resolve(
        npcReply(
            { type: 'move_to', target },
            {
                done: false,
                diagnostics: [
                    {
                        kind: 'missing_capability',
                        capability: 'avoid_enemies',
                        detail,
                        attempted:
                            'Обычная точка маршрута вместо автоматического обхода.',
                    },
                ],
            }
        )
    )
    await f.advance()
    expect(
        Math.hypot(f.actor.position.x - before.x, f.actor.position.y - before.y)
    ).toBeGreaterThan(0)
    expect(f.speech()).toContainEqual(
        expect.objectContaining({ text: detail, targetId: f.alice.actor.id })
    )
    await f.advance(3_000)
    await f.diagnostics.flush()
    const feedback = f
        .entries()
        .find((entry) => entry['category'] === 'model_feedback')
    expect(feedback).toMatchObject({
        source: 'model',
        category: 'model_feedback',
    })
    expect(feedback?.['diagnostic']).toMatchObject({
        capability: 'avoid_enemies',
    })
    expect(f.entries()).toContainEqual(
        expect.objectContaining({
            source: 'server',
            category: 'action_completed',
            reason: 'arrived',
        })
    )
})

it('requires explicit model consent for following and retains the peaceful refusal of combat', async () => {
    const f = setup()
    f.talk('Поможешь в бою?')
    await f.advance()
    expect(f.actor.soul.companion?.leaderId).toBeNull()
    f.provider.turns[0]?.resolve(
        npcReply(null, { taskAcceptance: 'accept', companionOrder: 'help' })
    )
    await f.advance()
    expect(f.actor.soul.companion?.leaderId).toBeNull()
    f.talk('Пойдём вместе?')
    await f.advance()
    expect(f.actor.soul.companion?.leaderId).toBeNull()
    f.provider.turns[1]?.resolve(
        npcReply(null, {
            speech: 'Буль, пойдём.',
            taskAcceptance: 'accept',
            companionOrder: 'follow',
        })
    )
    await f.advance()
    expect(f.actor.soul.companion).toMatchObject({
        order: 'follow',
        leaderId: f.alice.actor.id,
    })
    expect(f.actor.soul.kind).toBe('echo')
})

it('cancels a pending decision when its requester disconnects and drops the late reply', async () => {
    const f = setup()
    f.talk()
    await f.advance()
    f.room.handleClose(f.alice.socket)
    await f.advance()
    expect(f.provider.turns[0]?.signal.aborted).toBe(true)
    expect(f.actor.soul.kind).toBe('echo')
    f.provider.turns[0]?.resolve(
        npcReply({ type: 'speak', text: 'Ответ после отключения' })
    )
    await f.advance()
    expect(
        f.speech().some((event) => event.text === 'Ответ после отключения')
    ).toBe(false)
})
