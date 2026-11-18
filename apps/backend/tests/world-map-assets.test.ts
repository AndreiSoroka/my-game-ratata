import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
    CENTER_LOCATION_ID,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GameRoom } from '../src/game/room'
import { resolveWorldSeed, WorldMaps } from '../src/game/worldMaps'
import { createFetchHandler } from '../src/server'

const mapRoot = fileURLToPath(
    new URL('../../frontend/public/game/map', import.meta.url)
)
beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => vi.unstubAllGlobals())

function fixture(seed = 'map-http', epoch = 'epoch-A') {
    const maps = new WorldMaps({ seed, epoch, mapRoot })
    const room = new GameRoom(maps.navigation(CENTER_LOCATION_ID), {
        worldMaps: maps,
    })
    const fetch = async (url: string, options?: RequestInit) => {
        const response = await createFetchHandler(room)(
            new Request(`http://backend${url}`, options)
        )
        if (response === undefined) {
            throw new Error('Expected HTTP map response')
        }
        return response
    }
    return { maps, room, fetch, asset: room.navigation.summary.asset }
}

describe('one in-memory map source for the whole region', () => {
    it('reproduces the city independently of its epoch while keeping all other maps unchanged', () => {
        const first = new WorldMaps({
            seed: 'reproducible-city',
            epoch: 'first',
            mapRoot,
        })
        const second = new WorldMaps({
            seed: 'reproducible-city',
            epoch: 'second',
            mapRoot,
        })
        expect(first.asset('first', CENTER_LOCATION_ID)?.body).toBe(
            second.asset('second', CENTER_LOCATION_ID)?.body
        )
        expect(
            first.navigation(CENTER_LOCATION_ID).summary.asset.revision
        ).toBe(second.navigation(CENTER_LOCATION_ID).summary.asset.revision)
        expect(first.navigation(CENTER_LOCATION_ID).summary.asset.url).not.toBe(
            second.navigation(CENTER_LOCATION_ID).summary.asset.url
        )
        for (const { id } of WORLD_LOCATION_DEFINITIONS) {
            if (id === CENTER_LOCATION_ID) {
                continue
            }
            const asset = first.asset('first', id)
            assert(asset !== undefined)
            expect(JSON.parse(asset.body)).toEqual(
                JSON.parse(
                    fs.readFileSync(path.join(mapRoot, `${id}.json`), 'utf8')
                )
            )
        }
        const different = new WorldMaps({
            seed: 'another-city',
            epoch: 'third',
            mapRoot,
        })
        expect(different.asset('third', CENTER_LOCATION_ID)?.revision).not.toBe(
            first.asset('first', CENTER_LOCATION_ID)?.revision
        )
    })

    it('uses map anchors for resources, people and navigation instead of old city coordinates', () => {
        const { room, maps } = fixture()
        try {
            const navigation = room.navigation
            const nodes = room
                .adventureForWorkers()
                .resourceSnapshot(CENTER_LOCATION_ID)
            for (const kind of ['herbs', 'fiber', 'scrap']) {
                const node = nodes.find(
                    (entry) => entry.id === `${CENTER_LOCATION_ID}-${kind}`
                )
                assert(node !== undefined)
                expect(node.position).toEqual(
                    navigation.grid.cityAnchors?.[`resource.${kind}`]
                )
                expect(
                    navigation.isSolidTile(
                        navigation.worldToTile(node.position)
                    )
                ).toBe(false)
            }
            expect(room.getCharacter('npc_friendly_girl_1')?.position).toEqual(
                navigation.grid.cityAnchors?.['service.guild']
            )
            expect(room.getCharacter('npc_cleric_1')?.position).toEqual(
                navigation.grid.cityAnchors?.['service.chapel']
            )
            for (const { id } of WORLD_LOCATION_DEFINITIONS) {
                const snapshot = room.snapshot(1000, id)
                expect(snapshot.serverEpoch).toBe('epoch-A')
                expect(snapshot.location?.map.asset).toEqual(
                    maps.navigation(id).summary.asset
                )
            }
        } finally {
            room.stop()
        }
    })

    it('keeps simultaneously created worlds independent', () => {
        const first = fixture('independent-one', 'one')
        const second = fixture('independent-two', 'two')
        try {
            expect(first.room.navigation).not.toBe(second.room.navigation)
            expect(first.asset.revision).not.toBe(second.asset.revision)
            expect(first.maps.asset('two', CENTER_LOCATION_ID)).toBeUndefined()
            expect(second.maps.asset('one', CENTER_LOCATION_ID)).toBeUndefined()
        } finally {
            first.room.stop()
            second.room.stop()
        }
    })
})

describe('epoch-scoped public map assets', () => {
    it('serves the exact source used by simulation with public CORS and immutable revision caching', async () => {
        const f = fixture()
        try {
            const response = await f.fetch(f.asset.url, {
                headers: { origin: 'http://localhost:4173' },
            })
            expect(response.status).toBe(200)
            expect(response.headers.get('access-control-allow-origin')).toBe(
                '*'
            )
            expect(response.headers.get('cache-control')).toContain('immutable')
            expect(response.headers.get('etag')).toBe(`"${f.asset.revision}"`)
            const body = await response.text()
            expect(body).toBe(f.maps.asset('epoch-A', CENTER_LOCATION_ID)?.body)
            const parsed = JSON.parse(body) as { width: number; height: number }
            expect(parsed).toMatchObject({ width: 96, height: 80 })
            const cached = await f.fetch(f.asset.url, {
                headers: { 'if-none-match': `"${f.asset.revision}"` },
            })
            expect(cached.status).toBe(304)
            expect(await cached.text()).toBe('')
            const head = await f.fetch(f.asset.url, { method: 'HEAD' })
            expect(head.status).toBe(200)
            expect(await head.text()).toBe('')
        } finally {
            f.room.stop()
        }
    })

    it('rejects old epochs, unknown locations, traversal and mutation methods', async () => {
        const f = fixture()
        try {
            for (const url of [
                '/world/maps/old-epoch/map-2-2.json',
                '/world/maps/epoch-A/map-99-99.json',
                '/world/maps/epoch-A/%2e%2e%2fsecret.json',
            ]) {
                expect((await f.fetch(url)).status).toBe(404)
            }
            expect(
                (await f.fetch(f.asset.url, { method: 'POST' })).status
            ).toBe(405)
            expect(
                (await f.fetch(f.asset.url, { method: 'OPTIONS' })).status
            ).toBe(204)
        } finally {
            f.room.stop()
        }
    })
})

it('generates a fresh seed only when none is configured and validates explicit seeds', () => {
    expect(resolveWorldSeed()).not.toBe(resolveWorldSeed())
    expect(resolveWorldSeed('specified seed')).toBe('specified seed')
    for (const value of ['', '   ', 'x'.repeat(257), 'a\0b']) {
        expect(() => resolveWorldSeed(value)).toThrow('GAME_WORLD_SEED')
    }
})
