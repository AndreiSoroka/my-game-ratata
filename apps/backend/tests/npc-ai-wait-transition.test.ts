import { afterEach, beforeEach, expect, it, vi } from 'vitest'

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
function setup() {
    const provider = controlledNpcProvider()
    const f = npcRuntimeFixture(provider.decide)
    fixtures.push(f)
    return { ...f, provider }
}
type Fixture = ReturnType<typeof setup>
async function acceptOrder(
    f: Fixture,
    order: 'follow' | 'wait'
): Promise<void> {
    f.talk(order === 'follow' ? 'Пойдём вместе.' : 'Подожди здесь.')
    await f.advance()
    f.provider.turns
        .at(-1)
        ?.resolve(
            npcReply(null, { taskAcceptance: 'accept', companionOrder: order })
        )
    await f.advance()
}

it('consumes a waiting anchor only after accepting a new guide task and restores prior follow on completion', async () => {
    const f = setup()
    await acceptOrder(f, 'follow')
    await acceptOrder(f, 'wait')
    const oldAnchor = { ...f.actor.position }
    expect(f.actor.soul.companion?.order).toBe('wait')
    f.talk('Покажи гильдию.')
    await f.advance()
    const guild = f.provider.turns[2]?.context.observation.targets.find(
        (target) =>
            target.kind === 'building' &&
            target.name.toLocaleLowerCase().includes('гильд')
    )
    if (guild === undefined) {
        throw new Error('Missing authored guild')
    }
    f.provider.turns[2]?.resolve(
        npcReply(
            { type: 'guide', targetKey: guild.key },
            {
                taskAcceptance: 'accept',
                done: false,
                speech: 'Пойдём, покажу гильдию.',
            }
        )
    )
    await f.advance()
    expect(f.actor.soul.companion).toMatchObject({
        order: 'follow',
        leaderId: f.alice.actor.id,
    })
    expect(f.actor.soul.companion?.waitMode).toBeUndefined()
    for (
        let elapsed = 0;
        elapsed < 20_000 && f.provider.turns.length === 3;
        elapsed += 200
    ) {
        f.alice.send({ type: 'move_to', target: { ...f.actor.position } })
        await f.advance(200)
    }
    expect(f.provider.turns).toHaveLength(4)
    expect(f.provider.turns[3]?.context.events).toContainEqual(
        expect.objectContaining({
            kind: 'action',
            status: 'completed',
            reason: 'arrived_with_requester',
        })
    )
    f.provider.turns[3]?.resolve(
        npcReply(null, { done: true, speech: 'Вот вход в гильдию.' })
    )
    await f.advance(1500)
    expect(f.actor.soul.companion?.order).toBe('follow')
    expect(
        Math.hypot(
            f.actor.position.x - guild.position.x,
            f.actor.position.y - guild.position.y
        )
    ).toBeLessThanOrEqual(48)
    expect(
        Math.hypot(
            f.actor.position.x - oldAnchor.x,
            f.actor.position.y - oldAnchor.y
        )
    ).toBeGreaterThan(200)
})

it('retains the waiting instruction after conversation, a declined task and a refused companion order', async () => {
    const f = setup()
    await acceptOrder(f, 'wait')
    const revision = f.actor.soul.companion?.controlRevision
    const refusal = 'В бой не пойду, останусь ждать тебя здесь.'
    for (const reply of [
        npcReply(null, { taskAcceptance: 'none', speech: 'Всё хорошо.' }),
        npcReply(null, {
            taskAcceptance: 'decline',
            speech: 'Нет, останусь здесь.',
        }),
        npcReply(null, {
            taskAcceptance: 'accept',
            companionOrder: 'help',
            speech: 'Я помогу в бою.',
        }),
    ]) {
        f.talk('Передумаешь?')
        await f.advance()
        f.provider.turns.at(-1)?.resolve(reply)
        await f.advance()
        if (reply.companionOrder === 'help') {
            expect(
                f.provider.turns.at(-1)?.context.replyCorrection
            ).toMatchObject({
                code: 'command_unavailable',
                reason: { code: 'cannot_fight' },
                companionOrder: 'help',
            })
            expect(
                f.speech().some((event) => event.text === 'Я помогу в бою.')
            ).toBe(false)
            expect(f.actor.soul.companion?.controlRevision).toBe(revision)
            f.provider.turns.at(-1)?.resolve(
                npcReply(null, {
                    taskAcceptance: 'decline',
                    speech: refusal,
                })
            )
            await f.advance()
        }
        expect(f.actor.soul.companion).toMatchObject({
            order: 'wait',
            waitMode: 'until_request',
            controlRevision: revision,
        })
    }
    expect(f.speech().some((event) => event.text === refusal)).toBe(true)
    expect(f.speech().some((event) => event.text === 'Я помогу в бою.')).toBe(
        false
    )
})

it.each(['follow', 'wait'] as const)(
    'publishes one model acknowledgement for accepted %s, without a second private canonical utterance',
    async (order) => {
        const f = setup()
        const before = f.speech().length
        f.alice.send({
            type: 'chat',
            targetId: f.actor.id,
            text: order === 'follow' ? 'Пойдём вместе.' : 'Подожди здесь.',
        })
        await f.advance()
        const speech = 'Буль, хорошо.'
        f.provider.turns[0]?.resolve(
            npcReply(null, {
                taskAcceptance: 'accept',
                companionOrder: order,
                speech,
            })
        )
        await f.advance()
        expect(f.speech().slice(before)).toHaveLength(1)
        expect(f.speech().at(-1)?.text).toBe(speech)
    }
)

it('does not invent an acknowledgement when the model provides no speech', async () => {
    const f = setup()
    const before = f.speech().length
    await acceptOrder(f, 'follow')
    expect(f.speech().slice(before)).toHaveLength(0)
    expect(f.actor.soul.companion).toMatchObject({
        order: 'follow',
        leaderId: f.alice.actor.id,
    })
})

it('also avoids a duplicate acknowledgement when the model uses a legacy speak decision', async () => {
    const f = setup()
    f.talk('Пойдём вместе.')
    await f.advance()
    const before = f.speech().length
    f.provider.turns[0]?.resolve(
        npcReply(
            { type: 'speak', text: 'Буль, пойдём.' },
            { taskAcceptance: 'accept', companionOrder: 'follow' }
        )
    )
    await f.advance()
    expect(f.speech().slice(before)).toHaveLength(1)
    expect(f.speech().at(-1)?.text).toBe('Буль, пойдём.')
})
