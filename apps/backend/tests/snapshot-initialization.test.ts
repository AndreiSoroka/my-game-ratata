import { describe, expect, it, vi } from 'vitest'

import type { GameCharacter } from '../src/game/character'
import type { CharacterController } from '../src/game/controllers'
import { type JoinContext, joinRoom, leaveRoom } from '../src/game/roomIdentity'
import { type RoomSocket, sendSnapshot } from '../src/game/roomMessaging'
import { snapshotStream } from '../src/game/snapshotStreamState'
import { initialMessage, streamFixture } from './snapshotStreamFixture'

function joiningFixture() {
    const f = streamFixture()
    const observer = streamFixture('observer')
    const connections = new Map<RoomSocket, string | undefined>([
        [f.socket, undefined],
        [observer.socket, undefined],
    ])
    const characters = new Map<string, GameCharacter>()
    const nicknames = new Map<string, string>()
    const context: JoinContext = {
        characters,
        connections,
        nicknames,
        controllers: new Map<string, CharacterController>(),
        createPlayer: (_nickname, key) => {
            characters.set(f.actor.id, f.actor)
            nicknames.set(key, f.actor.id)
            return f.actor
        },
        mapFor: () => initialMessage(f.snapshot()).map,
        snapshotFor: () => f.snapshot(),
        tickMs: 50,
        now: () => 1000,
        closeChestViews: vi.fn(),
        closeConversations: vi.fn(),
    }
    const join = (createOnly = false) =>
        joinRoom(context, f.socket, 'Hero', 'human', undefined, createOnly)
    return { ...f, context, join, observer }
}

describe('initial world state acceptance', () => {
    it.each([0, 'throw'] as const)(
        'performs ordinary leave cleanup after rejected initialization (%s)',
        (result) => {
            const f = joiningFixture()
            if (result === 'throw') {
                f.send.mockImplementation(() => {
                    throw new Error('closed')
                })
            } else {
                f.send.mockReturnValue(result)
            }
            f.join()
            expect(f.context.connections.has(f.socket)).toBe(false)
            expect(f.actor.connected).toBe(false)
            expect(f.actor.soul.controlSource).toBe('script')
            expect(f.context.closeChestViews).toHaveBeenCalledOnce()
            expect(f.context.closeConversations).toHaveBeenCalledOnce()
            expect(f.close).toHaveBeenCalledOnce()
            expect(snapshotStream(f.socket).baseline).toBeUndefined()
            expect(
                f.observer.frames.some(
                    (message) =>
                        message.type === 'event' &&
                        message.event.kind === 'join'
                )
            ).toBe(false)
        }
    )

    it('reinitializes successful rejoin but preserves the stream on an invalid join', () => {
        const f = joiningFixture()
        f.join()
        expect(snapshotStream(f.socket)).toMatchObject({ streamId: 1, seq: 0 })
        f.join(true)
        expect(f.last()).toMatchObject({ type: 'error', code: 'name_taken' })
        expect(snapshotStream(f.socket)).toMatchObject({ streamId: 1, seq: 0 })
        f.join()
        expect(snapshotStream(f.socket)).toMatchObject({ streamId: 2, seq: 0 })
        sendSnapshot(f.socket, () => f.snapshot(2), {
            playerId: f.actor.id,
            stepMs: 50,
        })
        expect(f.last()).toMatchObject({
            type: 'snapshot_delta',
            streamId: 2,
            baseSeq: 0,
            seq: 1,
        })
        leaveRoom(
            f.context.connections,
            f.context.characters,
            f.socket,
            () => undefined
        )
        expect(snapshotStream(f.socket).baseline).toBeUndefined()
    })
})
