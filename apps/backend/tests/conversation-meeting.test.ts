import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import type { GameRoom } from '../src/game/room'
import { controlledNpcProvider, npcReply } from './npcAiRuntimeFixture'
import { joinScenarioRoom, openScenarioRoom } from './scenarioRoomHelpers'

const princessId = 'npc_princess_1'
const rooms: GameRoom[] = []
afterEach(() => {
    rooms.splice(0).forEach((room) => room.stop())
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function fixture() {
    const provider = controlledNpcProvider()
    const room = openScenarioRoom({
        config: parseNpcAiConfig(
            {
                proactive: false,
                npcs: [{ actorId: princessId, role: 'companion' }],
            },
            true
        ),
        provider: { decide: provider.decide },
    })
    rooms.push(room)
    const player = joinScenarioRoom(room, 'Meeting Hero')
    const princess = room.getCharacter(princessId)
    if (princess === undefined) {
        throw new Error('Missing princess')
    }
    player.actor.position = { ...princess.position }
    const view = () =>
        room.snapshot(undefined, player.actor.locationId, player.actor.id)
    const replies = () =>
        player.sent.flatMap((message) =>
            message.type === 'event' &&
            message.event.kind === 'chat' &&
            message.event.actorId === princessId
                ? [message.event]
                : []
        )
    return { ...player, princess, provider, view, replies }
}

describe('ordinary conversations establish companion introductions', () => {
    it('lets Leia introduce herself once and requires a separate model decision to follow', async () => {
        const { actor, princess, provider, view, replies, send } = fixture()
        const energy = actor.energy
        send({ type: 'interact', targetId: princess.id })
        expect(view().adventure?.dialogue).toMatchObject({
            npcId: princess.id,
            text: '',
        })
        expect(replies()).toEqual([])
        await vi.advanceTimersByTimeAsync(100)
        expect(provider.turns).toHaveLength(1)
        const introduction = 'Меня зовут Лея.'
        provider.turns[0]?.resolve(npcReply(null, { speech: introduction }))
        await vi.advanceTimersByTimeAsync(100)
        expect(replies()).toMatchObject([
            {
                kind: 'chat',
                actorId: princess.id,
                targetId: actor.id,
                text: introduction,
            },
        ])
        expect(view().adventure?.dialogue?.text).toBe(introduction)
        expect(princess.soul.companion?.leaderId).toBeNull()
        expect(actor.energy).toBe(energy)
        send({ type: 'dialogue_choice', choiceId: 'close' })

        send({
            type: 'companion_request',
            targetId: princess.id,
            request: 'follow',
        })
        await vi.advanceTimersByTimeAsync(100)
        expect(princess.soul.companion?.leaderId).toBeNull()
        expect(provider.turns).toHaveLength(2)
        expect(
            provider.turns[1]?.context.commandCapabilities?.orders.follow
        ).toMatchObject({ allowed: true })
        const consent = 'Я согласна идти вместе.'
        provider.turns[1]?.resolve(
            npcReply(null, {
                speech: consent,
                taskAcceptance: 'accept',
                companionOrder: 'follow',
            })
        )
        await vi.advanceTimersByTimeAsync(100)
        expect(princess.soul.companion).toMatchObject({
            leaderId: actor.id,
            order: 'follow',
            canFight: false,
        })
        expect(replies()).toHaveLength(1)
        expect(
            view().social?.privateMessages?.filter(
                ({ text }) => text === consent
            )
        ).toMatchObject([{ senderId: princess.id, text: consent }])
    })

    it('discards the late reply to a closed conversation and keeps later talk separate from consent', async () => {
        const { actor, princess, provider, view, replies, send } = fixture()
        send({ type: 'interact', targetId: princess.id })
        await vi.advanceTimersByTimeAsync(100)
        expect(provider.turns).toHaveLength(1)
        send({ type: 'dialogue_choice', choiceId: 'close' })
        provider.turns[0]?.resolve(
            npcReply(null, { speech: 'Запоздалое приветствие.' })
        )
        await vi.advanceTimersByTimeAsync(100)
        expect(replies()).toEqual([])
        expect(view().adventure?.dialogue).toBeNull()

        const question = 'Что умеет Путь странника?'
        send({
            type: 'companion_request',
            targetId: princess.id,
            request: 'talk',
            text: question,
        })
        await vi.advanceTimersByTimeAsync(100)
        const fresh = provider.turns.findLast(({ context }) =>
            context.events.some(
                (event) => event.kind === 'message' && event.text === question
            )
        )
        expect(fresh).toBeDefined()
        fresh?.resolve(npcReply(null, { speech: 'Молитва возвращает силы.' }))
        await vi.advanceTimersByTimeAsync(100)
        expect(replies()).toMatchObject([
            { targetId: actor.id, text: 'Молитва возвращает силы.' },
        ])
        expect(princess.soul.companion).toMatchObject({
            leaderId: null,
            order: 'idle',
        })
    })
})

it.each([
    'far',
    'dead actor',
    'dead NPC',
    'other location',
    'unknown NPC',
    'mute NPC',
    'offline actor',
    'offline NPC',
] as const)(
    'does not open a model conversation after invalid contact: %s',
    async (reason) => {
        const { actor, princess, provider, view, replies, send } = fixture()
        if (reason === 'far') {
            actor.position.x += 49
        }
        if (reason === 'dead actor') {
            actor.alive = false
        }
        if (reason === 'dead NPC') {
            princess.alive = false
        }
        if (reason === 'other location') {
            actor.locationId = 'map-0-0'
        }
        if (reason === 'mute NPC') {
            princess.soul.canSpeak = false
        }
        if (reason === 'offline actor') {
            actor.tags.add('offline')
        }
        if (reason === 'offline NPC') {
            princess.tags.add('offline')
        }
        send({
            type: 'interact',
            targetId: reason === 'unknown NPC' ? 'missing' : princess.id,
        })
        expect(view().adventure?.dialogue).toBeNull()

        actor.position = { ...princess.position }
        actor.locationId = princess.locationId
        actor.alive = true
        princess.alive = true
        princess.soul.canSpeak = true
        actor.tags.delete('offline')
        princess.tags.delete('offline')
        await vi.advanceTimersByTimeAsync(100)
        expect(provider.turns).toEqual([])
        expect(replies()).toEqual([])
        expect(princess.soul.companion?.leaderId).toBeNull()
    }
)
