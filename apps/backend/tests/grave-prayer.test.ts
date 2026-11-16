import { GRAVE_PURIFY_CAST_MS } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { GameCharacter } from '../src/game/character'
import { advanceRevive } from '../src/game/characterLife'
import { beginGravePurification, canPurifyGrave } from '../src/game/gravePrayer'
import {
    cancelPrayerCast,
    cancelPrayerForMovement,
} from '../src/game/prayerCancellation'
import { leaveRoom } from '../src/game/roomIdentity'
import type { RoomSocket } from '../src/game/roomMessaging'
import {
    gravePrayerFixture,
    prayerNow as now,
    prayerSource as source,
} from './gravePrayerTestHelpers'
import { masteryExperience, prayerXp } from './prayerMasteryTestHelpers'

describe('shared probabilistic grave prayer', () => {
    it.each(['hearth', 'road', 'lantern', 'grave'] as const)(
        'uses five ordinary three-second %s prayers, pays five mana and awards ten XP per step with a final one hundred fifty',
        (patron) => {
            const f = gravePrayerFixture()
            f.actor.progression.patron = patron
            for (let step = 0; step < 5; step++) {
                const startsAt = now + step * GRAVE_PURIFY_CAST_MS
                expect(f.actor.mana).toBe(120 - step * 5)
                expect(f.begin(startsAt)[0]).toMatchObject({
                    kind: 'cast',
                    phase: 'started',
                    durationMs: 3000,
                })
                expect(f.actor.mana).toBe(120 - (step + 1) * 5)
                expect(f.advance(startsAt + GRAVE_PURIFY_CAST_MS - 1)).toEqual(
                    []
                )
                const events = f.advance(startsAt + GRAVE_PURIFY_CAST_MS)
                expect(events).toContainEqual(
                    expect.objectContaining({
                        kind:
                            step === 4
                                ? 'grave_purified'
                                : 'grave_purification_progress',
                        target: { kind: 'grave', id: source.id },
                    })
                )
                expect(f.service.get(source.id)?.purification).toEqual({
                    completed: step + 1,
                    required: 5,
                })
                expect(f.actor.mana).toBe(120 - (step + 1) * 5)
                expect(masteryExperience(f.actor, 'prayer')).toBe(
                    prayerXp(step === 4 ? 190 : (step + 1) * 10)
                )
                expect(f.advance(startsAt + GRAVE_PURIFY_CAST_MS)).toEqual([])
            }
            expect(f.service.get(source.id)?.phase).toBe('purified')
            expect(f.begin(now + 20_000)[0]?.kind).toBe('notice')
            expect(f.actor.mana).toBe(95)
        }
    )

    it('allows any class with learned prayer, treats ruins identically and validates five mana', () => {
        const f = gravePrayerFixture()
        const learner = new GameCharacter({
            id: 'learner',
            nickname: 'learner',
            archetype: 'human',
            heroClass: 'vanguard',
            controllerKind: 'network_player',
            locationId: source.locationId,
            spawnPosition: f.actor.position,
        })
        expect(canPurifyGrave(learner, source.id, f.context(now))).toBe(false)
        learner.abilities.known.add('pray')
        f.service.damage(source.id, 100, now)
        expect(canPurifyGrave(learner, source.id, f.context(now))).toBe(true)
        learner.mana = 4
        expect(
            beginGravePurification(learner, source.id, f.context(now))[0]?.kind
        ).toBe('notice')
        learner.mana = 5
        expect(
            beginGravePurification(learner, source.id, f.context(now))[0]
                ?.durationMs
        ).toBe(3000)
        advanceRevive(
            learner,
            () => undefined,
            now + 3000,
            undefined,
            f.context(now + 3000)
        )
        expect(learner.mana).toBe(0)
        expect(f.service.get(source.id)?.purification?.completed).toBe(1)
        expect(f.service.get(source.id)?.phase).toBe('ruined')
    })
})

describe('purification interrupts', () => {
    const interruptions: Array<
        [string, (f: ReturnType<typeof gravePrayerFixture>) => void]
    > = [
        [
            'movement intention',
            (f) => {
                f.actor.setMoveInput({ x: 1, y: 0 })
            },
        ],
        [
            'queued path',
            (f) => {
                f.actor.setPath([{ x: 152, y: 168 }])
            },
        ],
        [
            'displacement',
            (f) => {
                f.actor.position.x++
            },
        ],
        [
            'stun',
            (f) => {
                f.actor.stunUntil = now + 11_000
            },
        ],
        [
            'death',
            (f) => {
                f.actor.applyDamage(f.actor.hp, now + 1)
            },
        ],
        [
            'disconnect',
            (f) => {
                f.actor.tags.add('offline')
            },
        ],
        [
            'travel',
            (f) => {
                f.actor.locationId = 'map-0-0'
            },
        ],
        [
            'lost sight',
            (f) => {
                for (let y = 0; y < 20; y++) {
                    f.navigation.grid.solid[y * 20 + 9] = true
                }
            },
        ],
    ]
    it.each(interruptions)(
        'cancels %s without refund or practice',
        (_label, interrupt) => {
            const f = gravePrayerFixture()
            f.begin()
            expect(f.actor.mana).toBe(115)
            interrupt(f)
            const mana = f.actor.mana
            expect(f.advance(now + 1)).toMatchObject([
                { kind: 'cast', phase: 'interrupted' },
            ])
            expect(f.actor.abilities.casting).toBeNull()
            expect(f.actor.mana).toBe(mana)
            expect(masteryExperience(f.actor, 'prayer')).toBe(prayerXp(0))
            expect(f.service.get(source.id)?.phase).toBe('active')
        }
    )

    it('uses ordinary movement and explicit cancellation helpers with one interruption receipt', () => {
        const f = gravePrayerFixture()
        f.begin()
        expect(
            cancelPrayerForMovement(f.actor, { x: 0, y: 0 }, now + 1)
        ).toEqual([])
        expect(
            cancelPrayerForMovement(f.actor, { x: 1, y: 0 }, now + 1)
        ).toHaveLength(1)
        expect(cancelPrayerCast(f.actor, now + 1)).toEqual([])
        expect(f.actor.isActionLocked(now + 1)).toBe(false)
        expect(f.advance(now + 10_000)).toEqual([])
    })

    it('cancels on socket disconnect immediately without waiting for the deadline', () => {
        const f = gravePrayerFixture()
        f.begin()
        const socket = { send: () => undefined } as unknown as RoomSocket
        leaveRoom(
            new Map([[socket, f.actor.id]]),
            f.characters,
            socket,
            () => undefined
        )
        expect(f.actor.abilities.casting).toBeNull()
        expect(f.service.get(source.id)?.phase).toBe('active')
    })
})

describe('ordinary NPC prayer and atomic completion', () => {
    it.each([0, 4])(
        'keeps the prepaid channel when mana falls to %s without charging again',
        (remaining) => {
            const f = gravePrayerFixture()
            f.begin()
            expect(f.actor.mana).toBe(115)
            f.actor.mana = remaining
            expect(f.advance(now + 1_000)).toEqual([])
            expect(f.actor.abilities.casting?.mode).toBe('purify_grave')
            expect(f.advance(now + GRAVE_PURIFY_CAST_MS)).toContainEqual({
                kind: 'grave_purification_progress',
                abilityId: 'pray',
                actorId: f.actor.id,
                target: { kind: 'grave', id: source.id },
            })
            expect(f.actor.mana).toBe(remaining)
            expect(masteryExperience(f.actor, 'prayer')).toBe(prayerXp(10))
        }
    )

    it('charges both scripted casts once, preserves repeated requests, and awards only the atomic final-step winner', () => {
        const f = gravePrayerFixture(true)
        const other = new GameCharacter({
            id: 'other-cleric',
            nickname: 'other',
            archetype: 'human',
            heroClass: 'cleric',
            controllerKind: 'scripted',
            faction: 'peaceful',
            locationId: source.locationId,
            spawnPosition: { x: 168, y: 136 },
        })
        f.characters.set(other.id, other)
        expect(f.begin()[0]?.phase).toBe('started')
        const original = f.actor.abilities.casting
        expect(f.begin(now + 5_000)[0]?.kind).toBe('notice')
        expect(f.actor.abilities.casting).toBe(original)
        beginGravePurification(other, source.id, f.context(now))
        expect(other.mana).toBe(115)
        for (let step = 0; step < 4; step++) {
            f.service.contributePurification(
                source.id,
                `prior:${String(step)}`,
                now - 1
            )
        }
        f.advance(now + GRAVE_PURIFY_CAST_MS)
        expect(
            advanceRevive(
                other,
                () => undefined,
                now + GRAVE_PURIFY_CAST_MS,
                undefined,
                f.context(now + GRAVE_PURIFY_CAST_MS)
            )
        ).toMatchObject([{ kind: 'cast', phase: 'interrupted' }])
        expect(f.actor.mana).toBe(115)
        expect(other.mana).toBe(115)
        expect(masteryExperience(f.actor, 'prayer')).toBe(prayerXp(150))
        expect(masteryExperience(other, 'prayer')).toBe(prayerXp(0))
        expect(f.service.get(source.id)?.phase).toBe('purified')
    })

    it('cancels only positive HP damage; a fully absorbing barrier preserves the channel', () => {
        const f = gravePrayerFixture()
        f.begin()
        const enemy = new GameCharacter({
            id: 'enemy',
            nickname: 'enemy',
            archetype: 'skeleton',
            controllerKind: 'mob1',
            spawnPosition: f.actor.position,
            locationId: f.actor.locationId,
        })
        f.actor.abilities.barrier = {
            remaining: 2,
            expiresAt: now + 20_000,
            practiced: false,
        }
        const input = {
            actor: enemy,
            target: f.actor,
            amount: 2,
            damageKind: 'physical' as const,
            now: now + 1,
            respawnDelayMs: 15_000,
        }
        expect(resolveCharacterDamage(input).hpDamage).toBe(0)
        expect(f.actor.abilities.casting?.mode).toBe('purify_grave')
        const hit = resolveCharacterDamage({ ...input, now: now + 2 })
        expect(hit.hpDamage).toBe(2)
        expect(hit.events).toContainEqual(
            expect.objectContaining({ kind: 'cast', phase: 'interrupted' })
        )
        f.actor.hp = f.actor.maxHp
        expect(f.advance(now + 10_000)).toEqual([])
        expect(f.actor.mana).toBe(115)
        expect(f.service.get(source.id)?.phase).toBe('active')
    })
})
