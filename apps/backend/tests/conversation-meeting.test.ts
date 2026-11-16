import type {
    ClientMessage,
    GameEventPayload,
    ServerMessage,
} from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'

afterEach(() => vi.unstubAllGlobals())

function fixture() {
    vi.stubGlobal('Bun', { env: {} })
    const room = new GameRoom()
    const sent: ServerMessage[] = []
    const socket = {
        send: (payload: string) =>
            sent.push(JSON.parse(payload) as ServerMessage),
    } as unknown as RoomSocket
    const command = (message: ClientMessage): void =>
        room.handleMessage(socket, JSON.stringify(message))
    room.handleOpen(socket)
    command({ type: 'join', nickname: 'Meeting Hero' })
    const init = sent.find((message) => message.type === 'world_init')
    const actor = room.getCharacter(init?.playerId ?? '')
    const princess = room.getCharacter('npc_princess_1')
    if (actor === undefined || princess === undefined) {
        throw new Error('Missing integration actors')
    }
    actor.position = { ...princess.position }
    sent.length = 0
    const events = (): GameEventPayload[] =>
        sent.flatMap((message) =>
            message.type === 'event' ? [message.event] : []
        )
    return { actor, princess, room, sent, command, events }
}

describe('ordinary conversations establish companion introductions', () => {
    it('lets a successful ordinary conversation introduce Lea without duplicate replies', () => {
        const { actor, princess, room, command, events, sent } = fixture()
        const energy = actor.energy
        command({ type: 'interact', targetId: princess.id })
        expect(events()).toHaveLength(1)
        expect(events()[0]).toMatchObject({
            kind: 'chat',
            actorId: princess.id,
            targetId: actor.id,
        })
        expect(
            room.snapshot(1_000, actor.locationId, actor.id).adventure?.dialogue
                ?.npcId
        ).toBe(princess.id)
        expect(princess.soul.companion?.leaderId).toBeNull()
        expect(actor.energy).toBe(energy)
        command({ type: 'dialogue_choice', choiceId: 'close' })
        sent.length = 0
        command({
            type: 'companion_request',
            targetId: princess.id,
            request: 'follow',
        })
        expect(princess.soul.companion).toMatchObject({
            leaderId: actor.id,
            order: 'follow',
            canFight: false,
        })
        expect(events()).toHaveLength(1)
    })

    it('uses the same remembered meeting for later companion talk without granting extra consent', () => {
        const { actor, princess, command, events, sent } = fixture()
        command({ type: 'interact', targetId: princess.id })
        command({ type: 'interact', targetId: princess.id })
        expect(events().filter((event) => event.kind === 'chat')).toHaveLength(
            2
        )
        sent.length = 0
        command({
            type: 'companion_request',
            targetId: princess.id,
            request: 'talk',
        })
        expect(events()[0]?.text).toContain(`Помню тебя, ${actor.nickname}`)
        command({
            type: 'companion_request',
            targetId: princess.id,
            request: 'help',
        })
        expect(princess.soul.companion?.leaderId).toBeNull()
        expect(events().at(-1)?.text).toContain('не стану сражаться')
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
        'does not introduce through an invalid ordinary interaction: %s',
        (reason) => {
            const { actor, princess, command, events, sent } = fixture()
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
            command({
                type: 'interact',
                targetId: reason === 'unknown NPC' ? 'missing' : princess.id,
            })
            actor.position = { ...princess.position }
            actor.locationId = princess.locationId
            actor.alive = true
            princess.alive = true
            princess.soul.canSpeak = true
            actor.tags.delete('offline')
            princess.tags.delete('offline')
            sent.length = 0
            command({
                type: 'companion_request',
                targetId: princess.id,
                request: 'follow',
            })
            expect(princess.soul.companion?.leaderId).toBeNull()
            expect(events()[0]?.text).toContain('Сначала поговорим')
        }
    )
})
