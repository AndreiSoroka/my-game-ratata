import type { MapSummary, WorldSnapshot } from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import { RuntimeMapLoading, runtimeMapRequest } from './runtimeMapLoading'
import type { RenderedTiledMap } from './tiledMap'

function summary(id = 'map-2-2', revision = 'v1'): MapSummary {
    return {
        id,
        asset: { url: `/world/maps/epoch/${id}.json`, revision },
        width: 96,
        height: 80,
        tileWidth: 16,
        tileHeight: 16,
        worldWidth: 1536,
        worldHeight: 1280,
        solidLayerNames: ['Collision'],
    }
}
function request(epoch: string, id?: string, revision?: string) {
    return {
        key: JSON.stringify([epoch, id ?? 'map-2-2', revision ?? 'v1']),
        locationId: id ?? 'map-2-2',
        map: summary(id, revision),
    }
}
function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: Error) => void
    const promise = new Promise<T>((yes, no) => {
        resolve = yes
        reject = no
    })
    return { promise, resolve, reject }
}
function fixture() {
    const load = vi.fn<(map: MapSummary) => Promise<RenderedTiledMap>>()
    const apply = vi.fn<() => Promise<void>>().mockResolvedValue()
    const ready = vi.fn<() => void>()
    const failed = vi.fn<(message: string) => void>()
    const loading = vi.fn<() => void>()
    return {
        maps: new RuntimeMapLoading({ load, apply, ready, failed, loading }),
        load,
        apply,
        ready,
        failed,
        loading,
    }
}
const rendered = () => ({}) as RenderedTiledMap

it('loads a descriptor once and invalidates the same location after a server epoch change', async () => {
    const f = fixture()
    f.load.mockResolvedValue(rendered())
    f.maps.observe(request('old'))
    f.maps.observe(request('old'))
    await vi.waitFor(() => expect(f.ready).toHaveBeenCalledOnce())
    expect(f.load).toHaveBeenCalledOnce()
    expect(f.maps.isReady).toBe(true)
    f.maps.observe(request('new'))
    expect(f.maps.isReady).toBe(false)
    await vi.waitFor(() => expect(f.ready).toHaveBeenCalledTimes(2))
    expect(f.load).toHaveBeenCalledTimes(2)
})

it('discards a late map or failure from an old epoch and applies only the new one', async () => {
    const f = fixture(),
        old = deferred<RenderedTiledMap>()
    f.load.mockReturnValueOnce(old.promise).mockResolvedValueOnce(rendered())
    f.maps.observe(request('old'))
    f.maps.observe(request('new'))
    await vi.waitFor(() => expect(f.ready).toHaveBeenCalledOnce())
    old.reject(new Error('Old server is gone'))
    await Promise.resolve()
    expect(f.failed).not.toHaveBeenCalled()
    expect(f.apply).toHaveBeenCalledOnce()
    expect(f.maps.isReady).toBe(true)
})

it('keeps a failed load retryable without a snapshot-driven request storm', async () => {
    const f = fixture()
    f.load
        .mockRejectedValueOnce(new Error('Temporary map outage'))
        .mockResolvedValueOnce(rendered())
    f.maps.observe(request('world'))
    await vi.waitFor(() => expect(f.failed).toHaveBeenCalledWith('Temporary map outage'))
    for (let index = 0; index < 20; index++) f.maps.observe(request('world'))
    expect(f.load).toHaveBeenCalledOnce()
    f.maps.retry()
    await vi.waitFor(() => expect(f.ready).toHaveBeenCalledOnce())
    expect(f.load).toHaveBeenCalledTimes(2)
})

it('never applies late data after stop', async () => {
    const f = fixture(),
        map = deferred<RenderedTiledMap>()
    f.load.mockReturnValue(map.promise)
    f.maps.observe(request('world'))
    f.maps.stop()
    map.resolve(rendered())
    await Promise.resolve()
    await Promise.resolve()
    expect(f.apply).not.toHaveBeenCalled()
    expect(f.ready).not.toHaveBeenCalled()
    expect(f.maps.isReady).toBe(false)
})

it('serializes initial engine startup and never marks a stale initial map ready', async () => {
    const f = fixture(),
        start = deferred<void>()
    f.load.mockResolvedValue(rendered())
    f.apply.mockReturnValueOnce(start.promise).mockResolvedValueOnce()
    f.maps.observe(request('old'))
    await vi.waitFor(() => expect(f.apply).toHaveBeenCalledOnce())
    f.maps.observe(request('new'))
    await Promise.resolve()
    expect(f.apply).toHaveBeenCalledOnce()
    start.resolve()
    await vi.waitFor(() => expect(f.apply).toHaveBeenCalledTimes(2))
    expect(f.ready).toHaveBeenCalledOnce()
    expect(f.maps.isReady).toBe(true)
})

it('includes epoch, identity, revision and URL in the map key and supports explicit fixture maps', () => {
    const fallback = summary('map1')
    const first = runtimeMapRequest({ serverEpoch: 'a' } as WorldSnapshot, fallback)
    expect(first?.map).toBe(fallback)
    for (const changed of [
        runtimeMapRequest({ serverEpoch: 'b' } as WorldSnapshot, fallback),
        runtimeMapRequest({ serverEpoch: 'a' } as WorldSnapshot, summary('map1', 'v2')),
        runtimeMapRequest({ serverEpoch: 'a' } as WorldSnapshot, {
            ...fallback,
            asset: { ...fallback.asset, url: '/other.json' },
        }),
    ])
        expect(changed?.key).not.toBe(first?.key)
})

it('turns synchronous loader faults into retryable failures', async () => {
    const f = fixture()
    f.load
        .mockImplementationOnce(() => {
            throw new Error('Invalid map address')
        })
        .mockResolvedValueOnce(rendered())
    expect(() => f.maps.observe(request('world'))).not.toThrow()
    await vi.waitFor(() => expect(f.failed).toHaveBeenCalledWith('Invalid map address'))
    f.maps.retry()
    await vi.waitFor(() => expect(f.ready).toHaveBeenCalledOnce())
})

it('does not silently keep a prior map ready when required metadata is absent', async () => {
    const f = fixture()
    f.load.mockResolvedValue(rendered())
    f.maps.observe(request('world'))
    await vi.waitFor(() => expect(f.ready).toHaveBeenCalledOnce())
    f.maps.observe(undefined)
    f.maps.observe(undefined)
    expect(f.maps.isReady).toBe(false)
    expect(f.failed).toHaveBeenCalledOnce()
    f.maps.observe(request('next'))
    await vi.waitFor(() => expect(f.ready).toHaveBeenCalledTimes(2))
})
