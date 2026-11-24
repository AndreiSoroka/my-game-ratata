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
            calls.positionVisible,
            expect.any(Function)
        )
        const visible = calls.audioWorld.mock.lastCall?.[3] as (id: string) => boolean
        expect(visible('hero')).toBe(true)
        expect(visible('hidden')).toBe(false)
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
            else if (cause === 'death') socket.onEvent({ kind: 'death', targetId: 'hero' }, 100_020)
            else socket.onEvent({ kind: 'permadeath', actorId: 'hero' }, 100_020)
            expect(calls.audioInvalidated).toHaveBeenCalledOnce()

            pending.resolve({ buildings: [], tileWidth: 16 } as unknown as RenderedTiledMap)
            await vi.waitFor(() => expect(calls.audioResumed).toHaveBeenCalledOnce())
            expect(calls.audioWorld).not.toHaveBeenCalled()

            initialize('a', 'map-2-1')
            expect(calls.audioWorld).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({ location: expect.objectContaining({ id: 'map-2-1' }) }),
                'hero',
                calls.positionVisible,
                expect.any(Function)
            )
        } finally {
            game.stop()
        }
    }
)

it('forwards cast time for audio only when the current map is ready', async () => {
    const { game } = setup()
    await startWorld(game)
    await vi.waitFor(() => expect(calls.audioWorld).toHaveBeenCalled())
    const pending = new Future<RenderedTiledMap>()
    calls.load.mockReturnValueOnce(pending.promise)
    const event = { kind: 'cast', abilityId: 'blink', phase: 'completed', actorId: 'hero' } as const
    try {
        calls.socketHandlers!.onEvent(event, 100_050)
        expect(calls.audioEvent).toHaveBeenLastCalledWith(event, 100_050)
        initialize('a', 'map-2-1')
        calls.socketHandlers!.onEvent(event, 100_100)
        expect(calls.audioEvent).toHaveBeenLastCalledWith(event, undefined)
    } finally {
        game.stop()
        pending.resolve({} as RenderedTiledMap)
    }
})
