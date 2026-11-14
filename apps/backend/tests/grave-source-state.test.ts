import {
    GRAVE_RESTORE_MS,
    GRAVE_SPAWN_INTERVAL_MS,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { graveFixture } from './graveTestHelpers'

const now = 10_000
const source = {
    id: 'authored-grave',
    locationId: 'map-3-2',
    position: { x: 168, y: 168 },
    propId: 'grave-prop',
}

describe('grave material state', () => {
    it('tracks exact hundredths, rejects invalid damage and snapshots every source without mutation', () => {
        const f = graveFixture()
        f.service.register(source, [], now)
        expect(f.service.get(source.id)).toEqual({
            ...source,
            hp: 100,
            maxHp: 100,
            material: 'stone',
            phase: 'active',
        })
        for (let i = 0; i < 5; i++) {
            expect(f.service.damage(source.id, 0.15, now)).toEqual({
                accepted: true,
                hpDamage: 0.15,
                ruined: false,
            })
        }
        expect(f.service.get(source.id)?.hp).toBe(99.25)
        for (const amount of [0, -1, Infinity, NaN]) {
            expect(f.service.damage(source.id, amount, now).accepted).toBe(
                false
            )
        }
        expect(f.service.damage(source.id, 1, NaN).accepted).toBe(false)
        expect(f.service.damage('unknown', 1, now).accepted).toBe(false)
        const result = f.service.snapshot(source.locationId)
        expect(result).toHaveLength(1)
        const snapshot = result[0]
        if (snapshot !== undefined) {
            snapshot.hp = 1
            snapshot.position.x = -1
        }
        expect(f.service.get(source.id)).toMatchObject({
            hp: 99.25,
            position: source.position,
        })
        expect(f.service.snapshot('map-0-0')).toEqual([])
    })

    it('ruins once for 30 minutes and starts a fresh 10 minute spawn clock at restoration', () => {
        const f = graveFixture()
        f.service.register(source, [], now, 30_000)
        expect(f.service.damage(source.id, 500, now + 1)).toEqual({
            accepted: true,
            hpDamage: 100,
            ruined: true,
        })
        const deadline = now + 1 + GRAVE_RESTORE_MS
        expect(f.service.get(source.id)).toMatchObject({
            hp: 0,
            phase: 'ruined',
            restoresAt: deadline,
        })
        expect(f.service.damage(source.id, 10, deadline - 1).accepted).toBe(
            false
        )
        f.service.update(deadline - 1, f.context)
        expect(f.created).toHaveLength(0)
        expect(f.service.get(source.id)?.phase).toBe('ruined')
        f.service.update(deadline, f.context)
        expect(f.service.get(source.id)).toEqual({
            ...source,
            hp: 100,
            maxHp: 100,
            material: 'stone',
            phase: 'active',
        })
        expect(f.created).toHaveLength(0)
        f.service.update(deadline + GRAVE_SPAWN_INTERVAL_MS - 1, f.context)
        expect(f.created).toHaveLength(0)
        f.service.update(deadline + GRAVE_SPAWN_INTERVAL_MS, f.context)
        expect(f.created).toHaveLength(1)
    })
})

describe('source identity and irreversible purification', () => {
    it('retains traveling children and their cap through ruin and restoration', () => {
        const f = graveFixture()
        f.service.register(source, [], now, 0)
        for (let i = 0; i < 3; i++) {
            f.service.update(now + i * GRAVE_SPAWN_INTERVAL_MS, f.context)
        }
        const child = f.created[0]?.character
        if (child === undefined) {
            throw new Error('Missing child')
        }
        child.locationId = 'map-0-0'
        const brokenAt = now + 3 * GRAVE_SPAWN_INTERVAL_MS
        f.service.damage(source.id, 100, brokenAt)
        f.service.update(brokenAt + GRAVE_RESTORE_MS, f.context)
        f.service.update(
            brokenAt + GRAVE_RESTORE_MS + GRAVE_SPAWN_INTERVAL_MS,
            f.context
        )
        expect(f.created).toHaveLength(3)
        expect(
            [...f.characters.values()].filter((actor) => actor.alive)
        ).toHaveLength(3)
    })

    it.each(['active', 'ruined'] as const)(
        'purifies a %s grave permanently while existing descendants keep ordinary death cleanup',
        (phase) => {
            const f = graveFixture()
            f.service.register(source, [], now, 0)
            f.service.update(now, f.context)
            const child = f.created[0]?.character
            if (child === undefined) {
                throw new Error('Missing child')
            }
            if (phase === 'ruined') {
                f.service.damage(source.id, 100, now + 1)
            }
            expect(f.service.purify(source.id, now + 2)).toBe(true)
            expect(f.service.purify(source.id, now + 3)).toBe(false)
            expect(f.service.damage(source.id, 100, now + 4).accepted).toBe(
                false
            )
            f.service.register(source, [], now + 5, 0)
            f.service.update(now + GRAVE_RESTORE_MS + 100_000_000, f.context)
            expect(f.service.get(source.id)).toMatchObject({
                phase: 'purified',
                hp: 0,
                propId: source.propId,
            })
            expect(f.created).toHaveLength(1)
            expect(child.alive).toBe(true)
            child.applyDamage(child.hp, now + 6)
            child.queueRespawn(now + 6, 15_000)
            f.service.update(now + 15_006, f.context)
            expect(f.characters.has(child.id)).toBe(false)
            f.service.register(source, [], now + 15_007, 0)
            f.service.update(now + 100_000_000, f.context)
            expect(f.created).toHaveLength(1)
            expect(f.service.get(source.id)?.phase).toBe('purified')
        }
    )

    it('purification wins at the birth or restoration boundary without a delayed catch-up birth', () => {
        const f = graveFixture()
        f.service.register(source, [], now, 30_000)
        f.service.purify(source.id, now + 30_000)
        f.service.update(now + 30_000, f.context)
        const other = { ...source, id: 'other' }
        f.service.register(other, [], now)
        f.service.damage(other.id, 100, now)
        f.service.purify(other.id, now + GRAVE_RESTORE_MS)
        f.service.update(
            now + GRAVE_RESTORE_MS + GRAVE_SPAWN_INTERVAL_MS,
            f.context
        )
        expect(f.created).toHaveLength(0)
        expect(
            f.service
                .snapshot(source.locationId)
                .every((grave) => grave.phase === 'purified')
        ).toBe(true)
    })
})
