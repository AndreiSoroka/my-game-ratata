import type { ServerMessage } from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import { parseNpcAiReply } from '../src/ai/npcCliProtocol'
import { GameRoom } from '../src/game/room'
import * as territory from '../src/game/savvaTerritory'
import { controlledNpcProvider, npcReply } from './npcAiRuntimeFixture'
import { joinScenarioRoom } from './scenarioRoomHelpers'

const attempt = { type: 'savva_persuasion' } as const
let room: GameRoom | undefined

afterEach(() => {
    room?.stop()
    room = undefined
    vi.useRealTimers()
})

function dialogueFixture() {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const provider = controlledNpcProvider()
    room = new GameRoom(undefined, {
        ai: {
            provider,
            config: parseNpcAiConfig(
                {
                    proactive: false,
                    npcs: [
                        { actorId: territory.SAVVA_ID, role: 'necromancer' },
                    ],
                },
                true
            ),
        },
    })
    room.start()
    const savva = room.getCharacter(territory.SAVVA_ID)
    const player = joinScenarioRoom(room, 'Переговорщик')
    if (savva === undefined) {
        throw new Error('Missing Savva fixture')
    }
    player.actor.locationId = savva.locationId
    player.actor.position = { ...savva.position }
    return {
        provider,
        player,
        savva,
        say(text: string) {
            player.send({ type: 'chat', targetId: savva.id, text })
        },
    }
}

function savvaSpeech(messages: ServerMessage[]) {
    return messages.flatMap((message) =>
        message.type === 'event' &&
        message.event.kind === 'chat' &&
        message.event.actorId === territory.SAVVA_ID
            ? [message.event]
            : []
    )
}

it('exposes actual Prayer of Ash effects and serves regular chat without spending a roll', async () => {
    vi.spyOn(territory, 'savvaPersuasionContext').mockReturnValue({
        episode: 7,
    })
    const roll = vi.spyOn(territory, 'attemptSavvaPersuasion')
    const f = dialogueFixture()
    f.say('Можешь помолиться за меня?')
    await vi.advanceTimersByTimeAsync(150)
    expect(f.provider.turns[0]?.context.learnedPrayers).toEqual([
        expect.objectContaining({
            abilityId: 'pray_grave',
            resourceRestored: 'hp',
            restores: ['undead'],
            resurrects: ['undead'],
            purifiesGraves: false,
        }),
    ])
    expect(f.provider.turns[0]?.context.savvaPersuasion).toEqual({
        stage: 'available',
    })
    f.provider.turns[0]?.resolve(
        npcReply(null, { speech: 'Молитва праха лечит нежить.' })
    )
    await vi.advanceTimersByTimeAsync(150)
    expect(roll).not.toHaveBeenCalled()
    expect(savvaSpeech(f.player.sent)).toContainEqual(
        expect.objectContaining({ text: 'Молитва праха лечит нежить.' })
    )
})

it.each([
    { roll: 15, success: true, speech: 'Что ж, оставим этот спор.' },
    { roll: 14, success: false, speech: 'Твои доводы не убедили меня.' },
])(
    'narrates exactly one authoritative roll of $roll after normal addressed chat',
    async ({ roll, success, speech }) => {
        vi.spyOn(territory, 'savvaPersuasionContext').mockReturnValue({
            episode: 7,
        })
        const resolveRoll = vi
            .spyOn(territory, 'attemptSavvaPersuasion')
            .mockReturnValue({ roll, success })
        const f = dialogueFixture()
        f.say('Остановись. Остальные люди тебе ничего не сделали.')
        await vi.advanceTimersByTimeAsync(150)
        const original = f.provider.turns[0]?.context.events[0]
        expect(original).toMatchObject({ channel: 'say', nearby: 'addressed' })
        f.provider.turns[0]?.resolve(
            npcReply(null, { informationRequest: attempt })
        )
        await vi.advanceTimersByTimeAsync(150)
        expect(resolveRoll).toHaveBeenCalledExactlyOnceWith(
            f.savva,
            f.player.actor,
            room,
            expect.any(Number),
            7,
            original?.id
        )
        const narration = f.provider.turns[1]
        expect(narration?.context.savvaPersuasion).toEqual({
            stage: 'resolved',
            roll,
            success,
        })
        expect(narration?.context.knowledgeScope?.lookupsRemaining).toBe(0)
        narration?.resolve(npcReply(null, { speech }))
        await vi.advanceTimersByTimeAsync(150)
        expect(resolveRoll).toHaveBeenCalledTimes(1)
        expect(savvaSpeech(f.player.sent)).toContainEqual(
            expect.objectContaining({ text: speech })
        )
    }
)

it('drops a departed speaker’s classification before it can request a roll', async () => {
    vi.spyOn(territory, 'savvaPersuasionContext').mockReturnValue({
        episode: 7,
    })
    const roll = vi.spyOn(territory, 'attemptSavvaPersuasion')
    const f = dialogueFixture()
    f.say('Все люди тебе не враги.')
    await vi.advanceTimersByTimeAsync(150)
    const first = f.provider.turns[0]
    expect(first).toBeDefined()
    f.player.actor.locationId = 'map-2-2'
    await vi.advanceTimersByTimeAsync(150)
    first?.resolve(npcReply(null, { informationRequest: attempt }))
    await vi.advanceTimersByTimeAsync(150)
    expect(first?.signal.aborted).toBe(true)
    expect(roll).not.toHaveBeenCalled()
    expect(f.provider.turns).toHaveLength(1)
})

it('uses an in-world fallback if the narrator attempts another roll', async () => {
    vi.spyOn(territory, 'savvaPersuasionContext').mockReturnValue({
        episode: 7,
    })
    const roll = vi
        .spyOn(territory, 'attemptSavvaPersuasion')
        .mockReturnValue({ roll: 20, success: true })
    const f = dialogueFixture()
    f.say('Пожалей людей и сложи оружие.')
    await vi.advanceTimersByTimeAsync(150)
    f.provider.turns[0]?.resolve(
        npcReply(null, { informationRequest: attempt })
    )
    await vi.advanceTimersByTimeAsync(150)
    expect(f.provider.turns[1]?.context.savvaPersuasion).toMatchObject({
        stage: 'resolved',
        success: true,
    })
    f.provider.turns[1]?.resolve(
        npcReply(null, { informationRequest: attempt })
    )
    await vi.advanceTimersByTimeAsync(150)
    expect(roll).toHaveBeenCalledTimes(1)
    expect(f.provider.turns).toHaveLength(2)
    expect(savvaSpeech(f.player.sent)).toContainEqual(
        expect.objectContaining({
            text: 'Хорошо. Я перестану считать каждого живого человека врагом.',
        })
    )
})

it('only accepts a parameterless model request for persuasion', () => {
    expect(
        parseNpcAiReply(npcReply(null, { informationRequest: attempt }))
            .informationRequest
    ).toEqual(attempt)
    expect(() =>
        parseNpcAiReply({
            ...npcReply(),
            informationRequest: { ...attempt, speakerId: 'anyone', roll: 20 },
        })
    ).toThrow('Invalid information request')
})
