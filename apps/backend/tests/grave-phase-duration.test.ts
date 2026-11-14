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

describe('phase-dependent purification', () => {
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
            expect(f.actor.mana).toBe(120)
            expect(f.advance(now + duration)).toContainEqual(
                expect.objectContaining({ kind: 'grave_purified' })
            )
            expect(f.actor.mana).toBe(100)
            expect(f.actor.progression.skills.faith.practice).toBe(1)
            expect(f.advance(now + duration + 1)).toEqual([])
            expect(f.actor.mana).toBe(100)
        }
    )

    it('keeps an active-source deadline when an ally breaks the grave mid-ritual', () => {
        const f = gravePrayerFixture()
        f.begin()
        f.service.damage(source.id, 100, now + 1)
        expect(f.advance(now + 10_000)).toEqual([])
        expect(f.actor.abilities.casting?.completesAt).toBe(now + 50_000)
        expect(f.actor.mana).toBe(120)
        expect(f.advance(now + 50_000)).toContainEqual(
            expect.objectContaining({ kind: 'grave_purified' })
        )
    })

    it('keeps a rubble deadline when the source restores before completion', () => {
        const f = gravePrayerFixture()
        f.service.damage(source.id, 100, now)
        const startedAt = now + GRAVE_RESTORE_MS - 5_000
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
        expect(f.advance(startedAt + 9_999)).toEqual([])
        expect(f.actor.abilities.casting?.completesAt).toBe(startedAt + 10_000)
        expect(f.advance(startedAt + 10_000)).toContainEqual(
            expect.objectContaining({ kind: 'grave_purified' })
        )
        expect(f.actor.mana).toBe(100)
    })
})
