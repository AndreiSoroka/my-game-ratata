import { afterEach, expect, it, vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import type { GameRoom } from '../src/game/room'
import { controlledNpcProvider, npcReply } from './npcAiRuntimeFixture'
import { joinScenarioRoom, openScenarioRoom } from './scenarioRoomHelpers'

const leiaId = 'npc_princess_1'
let room: GameRoom | undefined

afterEach(() => {
    room?.stop()
    room = undefined
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function fixture() {
    const provider = controlledNpcProvider()
    const game = openScenarioRoom({
        config: parseNpcAiConfig(
            {
                proactive: false,
                npcs: [{ actorId: leiaId, role: 'companion' }],
            },
            true
        ),
        provider: { decide: provider.decide },
    })
    room = game
    const leia = game.getCharacter(leiaId)
    if (leia === undefined) {
        throw new Error('Missing Leia')
    }
    const player = joinScenarioRoom(game, 'Leia’s acquaintance')
    const bystander = joinScenarioRoom(game, 'Passing traveler')
    for (const session of [player, bystander]) {
        session.actor.position = { ...leia.position }
    }
    const talk = (text: string) =>
        player.send({ type: 'whisper', targetId: leia.id, text })
    const advance = () => vi.advanceTimersByTimeAsync(100)
    const turn = (index: number) => {
        const turn = provider.turns[index]
        if (turn === undefined) {
            throw new Error(`Missing model turn ${String(index)}`)
        }
        return turn
    }
    return { leia, player, bystander, talk, advance, turn }
}

it('lets Leia announce and start following an acquaintance, and respects later refusal', async () => {
    const { leia, player, bystander, talk, advance, turn } = fixture()
    talk('Привет, Лея.')
    await advance()
    expect(turn(0).context.commandCapabilities?.followInitiative).toEqual([
        { targetId: player.actor.id, canPropose: true, canStart: false },
    ])
    turn(0).resolve(npcReply(null, { speech: 'Славный день.' }))
    await advance()
    expect(leia.soul.companion?.leaderId).toBeNull()

    talk('Я собираюсь осмотреть город.')
    await advance()
    expect(turn(1).context.commandCapabilities?.followInitiative).toEqual([
        { targetId: player.actor.id, canPropose: true, canStart: true },
    ])
    turn(1).resolve(
        npcReply(
            { type: 'start_following', targetId: bystander.actor.id },
            { speech: 'Пожалуй, пойду с тобой.' }
        )
    )
    await advance()
    expect(leia.soul.companion?.leaderId).toBeNull()
    expect(turn(2).context.replyCorrection?.reason?.code).toBe(
        'follow_initiative_unavailable'
    )
    turn(2).resolve(
        npcReply(
            { type: 'start_following', targetId: player.actor.id },
            { speech: 'Хочу взглянуть на город вместе с тобой.' }
        )
    )
    await advance()
    expect(leia.soul.companion?.leaderId).toBe(player.actor.id)

    talk('Я хочу побыть один. Не ходи за мной.')
    await advance()
    turn(3).resolve(
        npcReply({ type: 'leave_companion' }, { speech: 'Как пожелаешь.' })
    )
    await advance()
    expect(leia.soul.companion?.leaderId).toBeNull()

    talk('Что ты делаешь?')
    await advance()
    expect(
        turn(4).context.commandCapabilities?.followInitiative
    ).toBeUndefined()
    turn(4).resolve(
        npcReply(null, { speech: 'Решаю, куда отправлюсь дальше.' })
    )
    await advance()
    vi.setSystemTime(Date.now() + 30_000)
    player.send({
        type: 'companion_request',
        targetId: leia.id,
        request: 'follow',
    })
    await advance()
    turn(5).resolve(
        npcReply(null, {
            companionOrder: 'follow',
            taskAcceptance: 'accept',
            speech: 'Теперь я согласна идти рядом.',
        })
    )
    await advance()
    expect(leia.soul.companion?.leaderId).toBe(player.actor.id)

    player.send({
        type: 'companion_request',
        targetId: leia.id,
        request: 'dismiss',
    })
    expect(leia.soul.companion?.leaderId).toBeNull()
    talk('Куда теперь?')
    await advance()
    expect(
        turn(6).context.commandCapabilities?.followInitiative
    ).toBeUndefined()
    turn(6).resolve(npcReply(null, { speech: 'Я пока останусь здесь.' }))
    await advance()
})

it('keeps an unsolicited proposal separate from following and respects a spoken no', async () => {
    const { leia, player, talk, advance, turn } = fixture()
    talk('Привет, Лея.')
    await advance()
    turn(0).resolve(
        npcReply(
            { type: 'propose_follow', targetId: player.actor.id },
            { speech: 'Хочешь пройтись вместе?' }
        )
    )
    await advance()
    expect(leia.soul.companion?.leaderId).toBeNull()

    talk('Лея, не следуй за мной.')
    await advance()
    turn(1).resolve(npcReply(null, { speech: 'Хорошо, попрощаемся здесь.' }))
    await advance()
    vi.setSystemTime(Date.now() + 61_000)
    talk('Куда теперь?')
    await advance()
    expect(
        turn(2).context.commandCapabilities?.followInitiative
    ).toBeUndefined()
    turn(2).resolve(npcReply(null, { speech: 'Загляну в сады.' }))
    await advance()
    expect(leia.soul.companion?.leaderId).toBeNull()
})
