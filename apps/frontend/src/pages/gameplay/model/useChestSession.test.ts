import type { ClientMessage, WorldSnapshot } from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

import { characterFixture, worldFixture } from '../../../game/testing/characterFixture'
import { useChestSession } from './useChestSession'

describe('confirmed chest session lifecycle', () => {
    it('stops movement only when server confirms opening and suppresses stale snapshots until close acknowledgement', async () => {
        const scope = effectScope()
        const snapshot = ref<WorldSnapshot>(worldFixture([]))
        const player = ref(characterFixture('self'))
        const send = vi.fn<(command: ClientMessage) => void>()
        const onOpen = vi.fn<() => void>()
        const session = scope.run(() =>
            useChestSession({ snapshot, player, connected: () => true, send, onOpen })
        )!
        try {
            expect(session.chest.value).toBeUndefined()
            snapshot.value = { ...snapshot.value, chest: { chestId: 'a', items: [] } }
            await nextTick()
            expect(onOpen).toHaveBeenCalledOnce()
            expect(send.mock.calls.map(([command]) => command.type)).toEqual(['move_input'])
            session.close()
            expect(session.chest.value).toBeUndefined()
            expect(session.pending.value).toBe(true)
            snapshot.value = { ...snapshot.value, tick: 2, chest: { chestId: 'a', items: [] } }
            await nextTick()
            expect(session.chest.value).toBeUndefined()
            expect(onOpen).toHaveBeenCalledOnce()
            snapshot.value = { ...snapshot.value, chest: null }
            await nextTick()
            expect(session.pending.value).toBe(false)
            snapshot.value = { ...snapshot.value, chest: { chestId: 'a', items: [] } }
            await nextTick()
            expect(session.chest.value?.chestId).toBe('a')
            expect(onOpen).toHaveBeenCalledTimes(2)
        } finally {
            scope.stop()
        }
    })
    it('hides on death and disconnect instead of retaining private contents', async () => {
        const scope = effectScope()
        const snapshot = ref<WorldSnapshot>(worldFixture([]))
        const player = ref(characterFixture('self'))
        const connected = ref(true)
        const send = vi.fn<(command: ClientMessage) => void>()
        const session = scope.run(() =>
            useChestSession({
                snapshot,
                player,
                connected: () => connected.value,
                send,
                onOpen: () => undefined,
            })
        )!
        try {
            snapshot.value = { ...snapshot.value, chest: { chestId: 'a', items: [] } }
            await nextTick()
            player.value = { ...player.value, alive: false }
            await nextTick()
            expect(session.chest.value).toBeUndefined()
            expect(send).toHaveBeenLastCalledWith({ type: 'close_chest', chestId: 'a' })
            snapshot.value = { ...snapshot.value, chest: null }
            await nextTick()
            player.value = { ...player.value, alive: true }
            snapshot.value = { ...snapshot.value, chest: { chestId: 'b', items: [] } }
            await nextTick()
            connected.value = false
            await nextTick()
            expect(session.chest.value).toBeUndefined()
        } finally {
            scope.stop()
        }
    })
})
