import { Future } from 'excalibur'
import { expect, it, vi } from 'vitest'

import { calls, initialize, setup, startWorld } from './runtimeStartupFixture'
import type { RenderedTiledMap } from './tiledMap'

it('resumes audio with current visibility when returning to the installed map before travel finishes', async () => {
    const { game } = setup()
    await startWorld(game)
    await vi.waitFor(() => expect(calls.audioWorld).toHaveBeenCalled())
    const pending = new Future<RenderedTiledMap>()
    calls.load.mockReturnValueOnce(pending.promise)
    calls.audioResumed.mockClear()
    calls.audioWorld.mockClear()
    try {
        initialize('a', 'map-2-1')
        expect(calls.audioWorld).not.toHaveBeenCalled()
        initialize()
        expect(calls.audioResumed).toHaveBeenCalledOnce()
        expect(calls.audioWorld).toHaveBeenLastCalledWith(
            expect.objectContaining({ location: expect.objectContaining({ id: 'map-2-2' }) }),
            'hero',
            calls.positionVisible
        )
        pending.resolve({ buildings: [] } as unknown as RenderedTiledMap)
        await pending.promise
        await Promise.resolve()
        expect(calls.audioMap).not.toHaveBeenCalled()
        expect(calls.ambience).toHaveBeenCalledOnce()
    } finally {
        game.stop()
    }
})

it.each(['stream gap', 'death', 'permadeath'] as const)(
    'waits for a fresh snapshot when a pending map finishes after %s',
    async (cause) => {
        const { game } = setup()
        await startWorld(game)
        await vi.waitFor(() => expect(calls.audioWorld).toHaveBeenCalled())
        const pending = new Future<RenderedTiledMap>()
        calls.load.mockReturnValueOnce(pending.promise)
        calls.audioResumed.mockClear()
        calls.audioWorld.mockClear()
        try {
            initialize('a', 'map-2-1')
            const socket = calls.socketHandlers!
            if (cause === 'stream gap') socket.onSnapshotInvalidated?.()
            else if (cause === 'death') socket.onEvent({ kind: 'death', targetId: 'hero' })
            else socket.onEvent({ kind: 'permadeath', actorId: 'hero' })
            expect(calls.audioInvalidated).toHaveBeenCalledOnce()

            pending.resolve({ buildings: [], tileWidth: 16 } as unknown as RenderedTiledMap)
            await vi.waitFor(() => expect(calls.audioResumed).toHaveBeenCalledOnce())
            expect(calls.audioWorld).not.toHaveBeenCalled()

            initialize('a', 'map-2-1')
            expect(calls.audioWorld).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({ location: expect.objectContaining({ id: 'map-2-1' }) }),
                'hero',
                calls.positionVisible
            )
        } finally {
            game.stop()
        }
    }
)
