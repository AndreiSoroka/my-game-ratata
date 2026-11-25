import {
    type ClientMessage,
    isPlayerResumeToken,
    type ServerMessage,
} from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { createItemInstance } from '../src/game/inventory'
import { parseClientMessage } from '../src/game/messages'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'

afterEach(() => {
    vi.unstubAllGlobals()
})

const nickname = 'Искра у дороги'
const fresh = { type: 'join', nickname, requestResumeToken: true } as const

it('validates resume credentials at the command boundary without echoing them in errors', () => {
    const resumeToken = 'A'.repeat(43)
    expect(
        parseClientMessage(JSON.stringify({ ...fresh, resumeToken }))
    ).toEqual({
        message: { ...fresh, resumeToken },
    })
    expect(
        parseClientMessage(JSON.stringify({ ...fresh, requestResumeToken: 0 }))
    ).toEqual({
        error: 'join.requestResumeToken must be a boolean',
    })
    expect(
        parseClientMessage(
            JSON.stringify({ ...fresh, resumeToken: 'invalid!' })
        )
    ).toEqual({
        error: 'Invalid player resume token format',
    })
})

it('resumes the same identity and private history with its credential after disconnect', () => {
    const f = roomFixture()
    try {
        f.owner.send({ ...fresh, heroClass: 'ranger' })
        const first = f.owner.joined()
        const token = requireResumeToken(first.resumeToken)
        f.peer.send({ type: 'join', nickname: 'Сосед' })
        expect(f.peer.joined().resumeToken).toBeUndefined()
        const actor = f.room.getCharacter(first.playerId)
        const peer = f.room.getCharacter(f.peer.joined().playerId)
        if (actor === undefined || peer === undefined) {
            throw new Error('Missing test actors')
        }
        peer.position = { ...actor.position }
        const item = createItemInstance('bone')
        actor.inventory.push(item)
        f.owner.send({ type: 'whisper', targetId: peer.id, text: 'До встречи' })
        f.resume.send({ type: 'join', nickname, resumeToken: token })
        expect(f.resume.last()).toMatchObject({
            type: 'error',
            code: 'resume_busy',
        })
        expect(actor.connected).toBe(true)
        expect(f.resume.initial()).toBeUndefined()

        f.room.handleClose(f.owner.socket)
        f.resume.send(fresh)
        expect(f.resume.last()).toMatchObject({
            type: 'error',
            code: 'name_taken',
        })
        f.resume.send({
            ...fresh,
            nickname: 'Другой персонаж',
            resumeToken: token,
        })
        expect(f.resume.last()).toMatchObject({
            type: 'error',
            code: 'resume_invalid',
        })
        f.resume.send({ ...fresh, resumeToken: token + 'x' })
        expect(f.resume.last()).toMatchObject({
            type: 'error',
            code: 'invalid_message',
        })
        f.resume.send({
            ...fresh,
            resumeToken: `${token.startsWith('A') ? 'B' : 'A'}${token.slice(1)}`,
        })
        expect(f.resume.last()).toMatchObject({
            type: 'error',
            code: 'resume_invalid',
        })
        expect(actor.connected).toBe(false)

        f.resume.send({
            type: 'join',
            nickname: nickname.toUpperCase(),
            resumeToken: token,
        })
        const resumed = f.resume.joined()
        expect(resumed.playerId).toBe(first.playerId)
        expect(resumed.resumeToken === token).toBe(true)
        expect(resumed.streamId).not.toBe(first.streamId)
        expect(f.room.getCharacter(first.playerId)).toBe(actor)
        expect(actor.connected).toBe(true)
        expect(actor.inventory).toContain(item)
        expect(resumed.snapshot.social?.privateMessages).toContainEqual(
            expect.objectContaining({ senderId: actor.id, text: 'До встречи' })
        )
        expect(JSON.stringify(f.peer.messages).includes(token)).toBe(false)
    } finally {
        f.room.stop()
    }
})

it('rejects a credential for a retired life without reserving another identity', () => {
    const f = roomFixture()
    try {
        f.owner.send(fresh)
        const first = f.owner.joined()
        const token = requireResumeToken(first.resumeToken)
        const actor = f.room.getCharacter(first.playerId)
        if (actor === undefined) {
            throw new Error('Missing test actor')
        }
        actor.applyDamage(actor.hp, f.room.gameplayNow())
        f.owner.send({ type: 'abandon_life' })
        expect(f.room.getCharacter(first.playerId)).toBeUndefined()

        f.resume.send({ type: 'join', nickname, resumeToken: token })
        expect(f.resume.last()).toMatchObject({
            type: 'error',
            code: 'resume_invalid',
        })
        expect(f.resume.initial()).toBeUndefined()
        f.resume.send(fresh)
        expect(f.resume.joined().playerId).toBe('player_2')
        expect(f.resume.joined().resumeToken === token).toBe(false)
    } finally {
        f.room.stop()
    }
})

function roomFixture() {
    vi.stubGlobal('Bun', { env: {} })
    const room = new GameRoom()
    const client = () => {
        const messages: ServerMessage[] = []
        const socket = {
            send: (raw: string) =>
                messages.push(JSON.parse(raw) as ServerMessage),
        } as unknown as RoomSocket
        room.handleOpen(socket)
        const initial = () =>
            messages.findLast((message) => message.type === 'world_init')
        return {
            socket,
            messages,
            send: (message: ClientMessage) =>
                room.handleMessage(socket, JSON.stringify(message)),
            initial,
            joined: () => {
                const message = initial()
                if (message === undefined) {
                    throw new Error('Missing initial player snapshot')
                }
                return message
            },
            last: () => messages.at(-1),
        }
    }
    return { room, owner: client(), resume: client(), peer: client() }
}

function requireResumeToken(token: unknown): string {
    if (!isPlayerResumeToken(token)) {
        throw new Error('Missing valid player resume token')
    }
    return token
}
