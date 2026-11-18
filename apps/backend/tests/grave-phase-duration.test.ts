import {
    GRAVE_PURIFY_CAST_MS,
    GRAVE_RESTORE_MS,
    GRAVE_RUINED_PURIFY_CAST_MS,
    gravePurifyCastMs,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import {
    gravePrayerFixture,
    prayerNow as now,
    prayerSource as source,
} from './gravePrayerTestHelpers'

describe('ordinary prayer duration in every grave phase', () => {
    it.each([
        { damage: 0, duration: GRAVE_PURIFY_CAST_MS },
        { damage: 0.25, duration: GRAVE_PURIFY_CAST_MS },
        { damage: 100, duration: GRAVE_RUINED_PURIFY_CAST_MS },
    ])(
        'fixes duration at $duration ms after $damage HP damage',
        ({ damage, duration }) => {
            const f = gravePrayerFixture()
            if (damage > 0) {
                f.service.damage(source.id, damage, now)
            }
            const phase = f.service.get(source.id)?.phase
            if (phase === undefined) {
                throw new Error('Missing grave source')
            }
            expect(gravePurifyCastMs(phase)).toBe(duration)
            expect(f.begin()[0]).toMatchObject({
                phase: 'started',
                durationMs: duration,
                expiresAt: now + duration,
            })
            expect(f.actor.abilities.casting?.completesAt).toBe(now + duration)
            expect(f.advance(now + duration - 1)).toEqual([])
            expect(f.actor.mana).toBe(35)
            expect(f.advance(now + duration)).toContainEqual(
                expect.objectContaining({ kind: 'grave_purification_progress' })
            )
            expect(f.actor.mana).toBe(35)
            expect(f.actor.progression.masteries.prayer.experience).toBe(
                12_000_000n
            )
            expect(f.advance(now + duration + 1)).toEqual([])
            expect(f.actor.mana).toBe(35)
        }
    )

    it('keeps an active-source deadline when an ally breaks the grave mid-ritual', () => {
        const f = gravePrayerFixture()
        f.begin()
        f.service.damage(source.id, 100, now + 1)
        expect(f.advance(now + 2_999)).toEqual([])
        expect(f.actor.abilities.casting?.completesAt).toBe(now + 3_000)
        expect(f.actor.mana).toBe(35)
        expect(f.advance(now + 3_000)).toContainEqual(
            expect.objectContaining({ kind: 'grave_purification_progress' })
        )
    })

    it('keeps a rubble deadline when the source restores before completion', () => {
        const f = gravePrayerFixture()
        f.service.damage(source.id, 100, now)
        const startedAt = now + GRAVE_RESTORE_MS - 1_000
        f.begin(startedAt)
        f.service.update(now + GRAVE_RESTORE_MS, {
            characters: f.characters,
            navigation: () => f.navigation,
            occupants: () => [],
            add: () => {
                throw new Error('Restoration must not spawn immediately')
            },
            remove: (id) => {
                f.characters.delete(id)
            },
        })
        expect(f.service.get(source.id)?.phase).toBe('active')
        expect(f.advance(startedAt + 2_999)).toEqual([])
        expect(f.actor.abilities.casting?.completesAt).toBe(startedAt + 3_000)
        expect(f.advance(startedAt + 3_000)).toContainEqual(
            expect.objectContaining({ kind: 'grave_purification_progress' })
        )
        expect(f.actor.mana).toBe(35)
    })
})
