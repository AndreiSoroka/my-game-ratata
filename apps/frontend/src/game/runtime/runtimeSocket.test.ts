import type { GameEventPayload } from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { RuntimeSocket } from './runtimeSocket'

afterEach(() => vi.unstubAllGlobals())
it('ignores late messages from a retired client runtime after starting another life', () => {
    const sockets: EventTarget[] = []
    class TestSocket extends EventTarget {
        public constructor() {
            super()
            sockets.push(this)
        }
    }
    vi.stubGlobal('WebSocket', TestSocket)
    let stopped = false
    const onEvent = vi.fn<(event: GameEventPayload) => void>()
    const onStatus = vi.fn<(status: string) => void>()
    const onSnapshot = vi.fn<() => void>()
    const onWorldInit = vi.fn<() => void>()
    const onError = vi.fn<(message: string) => void>()
    const runtime = new RuntimeSocket({
        isStopped: () => stopped,
        onEvent,
        onStatus,
        onSnapshot,
        onWorldInit,
        onError,
    })
    runtime.connect('Hero', 'cleric')
    const receive = (data: unknown) =>
        sockets[0]?.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) }))
    receive({ type: 'event', event: { kind: 'notice', actorId: 'old', text: 'Before retirement' } })
    expect(onEvent).toHaveBeenCalledOnce()
    stopped = true
    receive({ type: 'event', event: { kind: 'permadeath', actorId: 'old' } })
    receive({ type: 'snapshot', snapshot: { characters: [] } })
    receive({ type: 'world_init', playerId: 'old', snapshot: { characters: [] } })
    receive({ type: 'error', message: 'Late old socket error' })
    expect(onEvent).toHaveBeenCalledOnce()
    expect(onSnapshot).not.toHaveBeenCalled()
    expect(onWorldInit).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
})
