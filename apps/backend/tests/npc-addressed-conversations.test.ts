import type { ServerMessage } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import type { GameCharacter } from '../src/game/character'
import { GameRoom } from '../src/game/room'
import { controlledNpcProvider, npcReply } from './npcAiRuntimeFixture'
import { joinScenarioRoom } from './scenarioRoomHelpers'

const merchantId = 'npc_merchant_1'
const guardId = 'npc_guard_1'
const smithId = 'npc_smith_1'

let room: GameRoom
let provider: ReturnType<typeof controlledNpcProvider>

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    provider = controlledNpcProvider()
    room = new GameRoom(undefined, {
        ai: {
            provider,
            config: parseNpcAiConfig(
                {
                    proactive: false,
                    npcs: [
                        { actorId: merchantId, role: 'advisor' },
                        { actorId: smithId, role: 'advisor' },
                    ],
                },
                true
            ),
        },
    })
    room.start()
})

afterEach(() => {
    room.stop()
    vi.useRealTimers()
})

it('projects only the addressed player a two-second scripted hum', () => {
    const alice = joinScenarioRoom(room, 'Conversation Alice')
    const bob = joinScenarioRoom(room, 'Conversation Bob')
    placeNear(room, guardId, alice.actor, bob.actor)
    alice.send({ type: 'interact', targetId: guardId })
    const view = room.snapshot(
        undefined,
        alice.actor.locationId,
        alice.actor.id
    )
    expect(view.adventure?.dialogue).toBeNull()
    expect(view.social?.speechActivity).toContainEqual(
        expect.objectContaining({ actorId: guardId, kind: 'typing' })
    )
    vi.setSystemTime(Date.now() + 1_950)
    room.social.npcSpeech.turns.advance(room.gameplayNow())
    expect(speech(alice.sent, guardId)).toEqual([])
    vi.setSystemTime(Date.now() + 50)
    room.social.npcSpeech.turns.advance(room.gameplayNow())
    expect(speech(alice.sent, guardId)).toEqual(['М-м-м-м-м…'])
    expect(speech(bob.sent, guardId)).toEqual([])
    expect(provider.turns).toHaveLength(0)
})

it('drops a closed reply while serving the other player’s current conversation', async () => {
    const alice = joinScenarioRoom(room, 'Conversation Alice')
    const bob = joinScenarioRoom(room, 'Conversation Bob')
    placeNear(room, merchantId, alice.actor, bob.actor)
    const privateQuestion = 'Личная просьба Алисы'
    alice.send({
        type: 'companion_request',
        request: 'talk',
        targetId: merchantId,
        text: privateQuestion,
    })
    await vi.advanceTimersByTimeAsync(100)
    const cancelled = provider.turns[0]
    expect(cancelled).toBeDefined()
    alice.send({ type: 'dialogue_choice', choiceId: 'close' })
    bob.send({
        type: 'companion_request',
        request: 'talk',
        targetId: merchantId,
        text: 'Что сейчас есть в лавке?',
    })
    await vi.advanceTimersByTimeAsync(150)
    expect(cancelled?.signal.aborted).toBe(true)
    expect(provider.turns[1]?.context.conversationDepartures).toHaveLength(1)
    expect(
        provider.turns[1]?.context.conversationDepartures?.[0]
    ).toMatchObject({
        npcId: merchantId,
        listenerId: alice.actor.id,
        listenerName: alice.actor.nickname,
    })
    expect(JSON.stringify(provider.turns[1]?.context)).not.toContain(
        privateQuestion
    )
    cancelled?.resolve(npcReply(null, { speech: 'Старый ответ' }))
    provider.turns[1]?.resolve(
        npcReply(null, { speech: 'Ответ для Боба', offerService: 'shop' })
    )
    await vi.advanceTimersByTimeAsync(150)
    expect(speech(alice.sent, merchantId)).toEqual([])
    expect(speech(bob.sent, merchantId)).toEqual(['Ответ для Боба'])
    expect(
        room.snapshot(undefined, bob.actor.locationId, bob.actor.id).adventure
            ?.dialogue
    ).toMatchObject({ text: 'Ответ для Боба', initialView: 'shop' })
    bob.send({
        type: 'companion_request',
        request: 'talk',
        targetId: merchantId,
        text: 'А сейчас?',
    })
    await vi.advanceTimersByTimeAsync(150)
    expect(provider.turns).toHaveLength(3)
    expect(provider.turns[2]?.context.conversationDepartures).toBeUndefined()
})

it('drops a pending reply after the player leaves the NPC’s visible interior', async () => {
    const alice = joinScenarioRoom(room, 'Conversation Alice')
    const merchant = room.getCharacter(merchantId)
    const navigation = room.navigationFor(alice.actor)
    const shop = navigation.grid.buildings?.find(
        (building) => building.name === 'Лавка Саввы'
    )
    if (merchant === undefined || shop === undefined) {
        throw new Error('Missing authored conversation target')
    }
    const doorway = {
        x: shop.entry.x,
        y: shop.bounds.y + shop.bounds.height,
    }
    merchant.position = { x: doorway.x, y: doorway.y - 12 }
    alice.actor.position = { ...merchant.position }
    const outsideGuard = character(room, guardId)
    outsideGuard.position = { ...doorway }
    vi.spyOn(navigation, 'hasLineOfSight').mockReturnValue(true)

    alice.send({ type: 'interact', targetId: merchantId })
    await vi.advanceTimersByTimeAsync(100)
    const turn = provider.turns[0]
    expect(turn).toBeDefined()
    alice.actor.position = doorway
    turn?.resolve(npcReply(null, { speech: 'Запоздалый ответ' }))
    await vi.advanceTimersByTimeAsync(150)
    expect(speech(alice.sent, merchantId)).toEqual([])

    alice.send({ type: 'whisper', targetId: merchantId, text: 'Савва!' })
    await vi.advanceTimersByTimeAsync(150)
    expect(provider.turns).toHaveLength(1)
    expect(room.social.whispers.snapshot(alice.actor, Date.now())).toBeNull()
    expect(
        room.snapshot(undefined, outsideGuard.locationId, outsideGuard.id)
            .social?.conversationDepartures
    ).toBeUndefined()

    const bob = joinScenarioRoom(room, 'Conversation Bob')
    placeNear(room, merchantId, bob.actor)
    bob.send({ type: 'interact', targetId: merchantId })
    await vi.advanceTimersByTimeAsync(100)
    expect(
        provider.turns[1]?.context.conversationDepartures?.[0]
    ).toMatchObject({
        npcId: merchantId,
        listenerId: alice.actor.id,
    })
})

it('gives NPCs and players the same visible departure while keeping the private question scoped', async () => {
    const alice = joinScenarioRoom(room, 'Conversation Alice')
    const bob = joinScenarioRoom(room, 'Conversation Bob')
    const away = joinScenarioRoom(room, 'Conversation Away')
    const smith = character(room, smithId)
    const guard = character(room, guardId)
    placeNear(room, merchantId, alice.actor, bob.actor, smith, guard)
    away.actor.locationId = 'map-1-2'
    const question = 'Не рассказывай никому о моём тайнике.'
    alice.send({ type: 'whisper', targetId: merchantId, text: question })
    await vi.advanceTimersByTimeAsync(100)
    expect(provider.turns).toHaveLength(1)
    alice.send({ type: 'whisper_open', targetId: merchantId })
    await vi.advanceTimersByTimeAsync(50)
    expect(provider.turns[0]?.signal.aborted).toBe(false)

    alice.send({ type: 'whisper_close' })
    await vi.advanceTimersByTimeAsync(100)
    expect(provider.turns).toHaveLength(1)
    const observed = room.snapshot(
        undefined,
        bob.actor.locationId,
        bob.actor.id
    )
    const departure = observed.social?.conversationDepartures?.[0]
    expect(departure).toMatchObject({
        listenerId: alice.actor.id,
        listenerName: alice.actor.nickname,
        npcId: merchantId,
    })
    expect(JSON.stringify(observed.social)).not.toContain(question)
    expect(
        room.snapshot(undefined, guard.locationId, guard.id).social
            ?.conversationDepartures
    ).toEqual([departure])
    expect(
        room.snapshot(undefined, away.actor.locationId, away.actor.id).social
            ?.conversationDepartures
    ).toBeUndefined()

    bob.send({ type: 'interact', targetId: smithId })
    await vi.advanceTimersByTimeAsync(100)
    const input = provider.turns[1]?.context
    expect(input?.actorId).toBe(smithId)
    expect(input?.conversationDepartures).toEqual([departure])
    expect(JSON.stringify(input)).not.toContain(question)
})

it('asks which Savva a bare name means and routes a full name', async () => {
    const alice = joinScenarioRoom(room, 'Conversation Alice')
    placeNear(room, merchantId, alice.actor)
    alice.send({ type: 'chat', text: 'Савва' })
    await vi.advanceTimersByTimeAsync(100)
    expect(provider.turns).toHaveLength(0)
    expect(
        alice.sent.some(
            (message) =>
                message.type === 'event' &&
                message.event.kind === 'notice' &&
                message.event.text?.includes(
                    'торговца Савву или некроманта Савву'
                ) === true
        )
    ).toBe(true)
    alice.send({ type: 'chat', text: 'Торговец Савва, что в лавке?' })
    await vi.advanceTimersByTimeAsync(100)
    expect(provider.turns.map(({ context }) => context.actorId)).toEqual([
        merchantId,
    ])
})

function speech(
    messages: ServerMessage[],
    npcId: string
): Array<string | undefined> {
    return messages.flatMap((message) =>
        message.type === 'event' &&
        message.event.kind === 'chat' &&
        message.event.actorId === npcId
            ? [message.event.text]
            : []
    )
}

function placeNear(
    room: GameRoom,
    npcId: string,
    ...actors: GameCharacter[]
): void {
    const npc = character(room, npcId)
    for (const actor of actors) {
        // Place participants for unit testing the conversation queue.
        actor.position = { ...npc.position }
    }
}

function character(room: GameRoom, npcId: string): GameCharacter {
    const npc = room.getCharacter(npcId)
    if (npc === undefined) {
        throw new Error('Missing conversation target')
    }
    return npc
}
