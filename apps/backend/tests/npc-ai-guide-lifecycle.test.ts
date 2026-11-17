import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { reconcileNpcAction } from '../src/ai/actionResolution'
import { memoryForCharacter } from '../src/ai/characterMinds'
import { parseNpcAiConfig } from '../src/ai/config'
import { createNpcAiState } from '../src/ai/runtimeState'
import { NpcAiSessionActions } from '../src/ai/session'
import { CompanionService } from '../src/game/companions'
import {
    controlledNpcProvider,
    npcReply,
    npcRuntimeFixture,
} from './npcAiRuntimeFixture'

const fixtures: Array<ReturnType<typeof npcRuntimeFixture>> = []
beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
})
afterEach(async () => {
    for (const f of fixtures.splice(0)) {
        f.room.stop()
        await f.diagnostics.flush()
    }
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

async function beginGuide() {
    const provider = controlledNpcProvider()
    const f = npcRuntimeFixture(provider.decide)
    fixtures.push(f)
    const request = 'Покажи гильдию.'
    f.talk(request)
    await f.advance()
    const guild = provider.turns[0]?.context.observation.targets.find(
        (target) =>
            target.kind === 'building' && target.name.includes('Гильдия')
    )
    if (guild === undefined) {
        throw new Error('Missing observed guild')
    }
    provider.turns[0]?.resolve(
        npcReply(
            { type: 'guide', targetKey: guild.key },
            {
                taskAcceptance: 'accept',
                speech: 'Пойдём, покажу гильдию.',
                done: false,
            }
        )
    )
    return { ...f, provider, guild, request }
}

it('closes a lost-requester guide once and needs a fresh request before another model turn', async () => {
    const f = await beginGuide()
    await f.advance(3000)
    const waitingAt = { ...f.actor.position }
    await f.advance(61_000)
    expect(f.provider.turns).toHaveLength(1)
    expect(f.actor.position).toEqual(waitingAt)
    vi.setSystemTime(Date.now() + 61_000)
    await f.advance()
    expect(f.provider.turns).toHaveLength(1)
    await f.diagnostics.flush()
    const entries = f
        .entries()
        .filter((entry) => entry['request'] === f.request)
    expect(
        entries.filter(
            (entry) =>
                entry['category'] === 'action_failed' &&
                entry['reason'] === 'Собеседник не вернулся к проводнику.'
        )
    ).toHaveLength(1)
    expect(
        entries.filter(
            (entry) =>
                entry['category'] === 'request_status' &&
                typeof entry['reason'] === 'string' &&
                entry['reason'].startsWith('failed:')
        )
    ).toHaveLength(1)
    f.alice.send({ type: 'move_to', target: { ...f.actor.position } })
    for (
        let elapsed = 0;
        elapsed < 5000 &&
        Math.hypot(
            f.actor.position.x - f.alice.actor.position.x,
            f.actor.position.y - f.alice.actor.position.y
        ) > 40;
        elapsed += 100
    ) {
        await f.advance(100)
    }
    f.talk('Теперь расскажи о гильдии.')
    await f.advance()
    expect(f.provider.turns).toHaveLength(2)
    expect(f.provider.turns[1]?.context.task).toBeNull()
    f.provider.turns[1]?.resolve(
        npcReply(null, { taskAcceptance: 'none', speech: 'Расскажу.' })
    )
    await f.advance()
}, 20_000)

it.each([false, true])(
    'concludes an arrived guide once, rejecting a model restart: %s',
    async (restart) => {
        const f = await beginGuide()
        for (
            let elapsed = 0;
            elapsed < 25_000 && f.provider.turns.length < 2;
            elapsed += 200
        ) {
            f.alice.send({ type: 'move_to', target: { ...f.actor.position } })
            await f.advance(200)
        }
        expect(f.provider.turns).toHaveLength(2)
        const closing = f.provider.turns[1]
        expect(closing?.context.task?.concluding).toBe(true)
        expect(
            closing?.context.events.some(
                (event) =>
                    event.kind === 'action' &&
                    event.status === 'completed' &&
                    event.reason === 'arrived_with_requester'
            )
        ).toBe(true)
        expect(
            closing?.context.facts.some(
                (fact) =>
                    fact.kind === 'scouting' &&
                    fact.position.x === f.actor.position.x &&
                    fact.position.y === f.actor.position.y
            )
        ).toBe(true)
        const atGuild = { ...f.actor.position }
        closing?.resolve(
            restart
                ? npcReply(
                      { type: 'guide', targetKey: f.guild.key },
                      {
                          taskAcceptance: 'accept',
                          speech: 'Пойдём ещё раз.',
                          done: false,
                      }
                  )
                : npcReply(null, {
                      taskAcceptance: 'none',
                      speech: 'Мы у гильдии.',
                      done: true,
                  })
        )
        await f.advance()
        if (restart) {
            expect(f.provider.turns).toHaveLength(3)
            expect(f.provider.turns[2]?.context.replyCorrection?.code).toBe(
                'task_concluded'
            )
            f.provider.turns[2]?.resolve(
                npcReply(null, {
                    taskAcceptance: 'none',
                    speech: 'Мы уже пришли.',
                    done: true,
                })
            )
        }
        await f.advance(2000)
        expect(f.provider.turns).toHaveLength(restart ? 3 : 2)
        expect(f.actor.position).toEqual(atGuild)
        if (restart) {
            expect(
                f.speech().some((event) => event.text === 'Пойдём ещё раз.')
            ).toBe(false)
        } else {
            expect(
                f.room
                    .snapshot(Date.now(), f.actor.locationId, f.alice.actor.id)
                    .social?.privateMessages?.filter(
                        (event) => event.text === 'Мы у гильдии.'
                    )
            ).toHaveLength(1)
        }
        await f.diagnostics.flush()
        const entries = f
            .entries()
            .filter((entry) => entry['request'] === f.request)
        expect(
            entries.filter(
                (entry) =>
                    entry['category'] === 'action_started' &&
                    typeof entry['action'] === 'object' &&
                    entry['action'] !== null &&
                    'type' in entry['action'] &&
                    entry['action'].type === 'guide'
            )
        ).toHaveLength(1)
        expect(
            entries.filter(
                (entry) =>
                    entry['category'] === 'action_completed' &&
                    entry['reason'] === 'arrived_with_requester'
            )
        ).toHaveLength(1)
        const remembered = memoryForCharacter(f.actor)
            .entries()
            .filter((entry) => entry.id.startsWith('scouting:'))
        expect(remembered).toHaveLength(1)
        expect(remembered[0]?.source).toBe('seen')
    }
)

it('ends the overall guide deadline at its boundary without a continuation event', async () => {
    const f = npcRuntimeFixture(() => Promise.resolve(npcReply()))
    fixtures.push(f)
    const config = parseNpcAiConfig(
        { npcs: [{ actorId: f.actor.id, role: 'companion' }] },
        true
    )
    const actorConfig = config.npcs[0]
    if (actorConfig === undefined) {
        throw new Error('Missing companion configuration')
    }
    const state = createNpcAiState(actorConfig, f.actor)
    state.task = {
        id: 'guide-timeout',
        requesterId: f.alice.actor.id,
        request: 'Покажи гильдию.',
        steps: 1,
    }
    state.guide = {
        id: 'guide-overall',
        decision: { type: 'guide', targetKey: 'building:guild' },
        locationId: f.actor.locationId,
        destination: { ...f.actor.position },
        deadline: Date.now(),
    }
    const companions = new CompanionService()
    const sessions = new NpcAiSessionActions(
        f.room,
        companions,
        config,
        f.diagnostics,
        (kind) => kind
    )
    const finish = vi.spyOn(sessions, 'finishWithNotice')
    for (let repeat = 0; repeat < 2; repeat++) {
        reconcileNpcAction(
            f.room,
            companions,
            sessions,
            f.diagnostics,
            state,
            f.actor,
            Date.now()
        )
    }
    expect(finish).toHaveBeenCalledTimes(1)
    expect(state.task).toBeNull()
    expect(state.guide).toBeUndefined()
    expect(state.pending).toBeUndefined()
    expect(state.events).toEqual([])
    await f.diagnostics.flush()
    expect(
        f
            .entries()
            .filter(
                (entry) =>
                    entry['category'] === 'request_status' &&
                    typeof entry['reason'] === 'string' &&
                    entry['reason'].startsWith('failed:')
            )
    ).toHaveLength(1)
})
