import {
    GRAVE_PURIFY_CAST_MS,
    GRAVE_PURIFY_MANA_COST,
} from '@my-game-ratata/contracts'
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

describe('guaranteed grave prayer', () => {
    it.each(['hearth', 'road', 'lantern', 'grave'] as const)(
        'channels for 50 seconds with %s, pays 20 MP only at completion and practices once',
        (patron) => {
            const f = gravePrayerFixture()
            f.actor.progression.patron = patron
            const beforeMana = f.actor.mana
            const beforeFaith = f.actor.progression.skills.faith.practice
            const beforeMiracles = f.actor.progression.skills.miracles.practice
            expect(f.begin()).toMatchObject([
                {
                    kind: 'cast',
                    phase: 'started',
                    target: { kind: 'grave', id: source.id },
                },
            ])
            expect(f.actor.mana).toBe(beforeMana)
            expect(f.actor.snapshot(now).abilities?.casting).toMatchObject({
                mode: 'purify_grave',
                target: { kind: 'grave', id: source.id },
                completesAt: now + GRAVE_PURIFY_CAST_MS,
            })
            expect(f.advance(now + GRAVE_PURIFY_CAST_MS - 1)).toEqual([])
            expect(f.service.get(source.id)?.phase).toBe('active')
            const events = f.advance(now + GRAVE_PURIFY_CAST_MS)
            expect(events).toContainEqual({
                kind: 'grave_purified',
                actorId: f.actor.id,
                target: { kind: 'grave', id: source.id },
            })
            expect(f.service.get(source.id)?.phase).toBe('purified')
            expect(f.actor.mana).toBe(beforeMana - GRAVE_PURIFY_MANA_COST)
            expect(f.actor.progression.skills.faith.practice).toBe(
                beforeFaith + 1
            )
            expect(f.actor.progression.skills.miracles.practice).toBe(
                beforeMiracles + 1
            )
            expect(f.advance(now + GRAVE_PURIFY_CAST_MS + 1)).toEqual([])
            expect(f.begin(now + GRAVE_PURIFY_CAST_MS + 5_000)[0]?.kind).toBe(
                'notice'
            )
            expect(f.actor.mana).toBe(beforeMana - GRAVE_PURIFY_MANA_COST)
        }
    )

    it('allows ruined graves and trained nonclerics but requires learned prayer and sufficient resources', () => {
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
        learner.progression.skills.miracles.level = 5
        expect(canPurifyGrave(learner, source.id, f.context(now))).toBe(false)
        learner.abilities.known.add('pray')
        learner.progression.skills.miracles.level = 4
        expect(canPurifyGrave(learner, source.id, f.context(now))).toBe(false)
        learner.progression.skills.miracles.level = 5
        f.service.damage(source.id, 100, now)
        expect(canPurifyGrave(learner, source.id, f.context(now))).toBe(true)
        learner.mana = 19
        expect(
            beginGravePurification(learner, source.id, f.context(now))[0]?.kind
        ).toBe('notice')
        learner.mana = 20
        expect(
            beginGravePurification(learner, source.id, f.context(now))[0]?.phase
        ).toBe('started')
        advanceRevive(
            learner,
            () => undefined,
            now + 10_000,
            undefined,
            f.context(now + 10_000)
        )
        expect(learner.mana).toBe(0)
        expect(f.service.get(source.id)?.phase).toBe('purified')
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
            'lost mana',
            (f) => {
                f.actor.mana = 19
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
        'cancels %s without payment or practice',
        (label, interrupt) => {
            const f = gravePrayerFixture()
            f.begin()
            interrupt(f)
            const mana = f.actor.mana
            const checkedAt =
                label === 'lost mana' ? now + GRAVE_PURIFY_CAST_MS : now + 1
            expect(f.advance(checkedAt)).toMatchObject([
                { kind: 'cast', phase: 'interrupted' },
            ])
            expect(f.actor.abilities.casting).toBeNull()
            expect(f.actor.mana).toBe(mana)
            expect(f.actor.progression.skills.faith.practice).toBe(0)
            expect(f.actor.progression.skills.miracles.practice).toBe(0)
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
    it('checks mana at completion and permits a temporary shortfall during the channel', () => {
        const f = gravePrayerFixture()
        f.begin()
        f.actor.mana = 19
        expect(f.advance(now + 5_000)).toEqual([])
        expect(f.actor.abilities.casting?.mode).toBe('purify_grave')
        f.actor.mana = 20
        expect(f.advance(now + GRAVE_PURIFY_CAST_MS)).toContainEqual({
            kind: 'grave_purified',
            actorId: f.actor.id,
            target: { kind: 'grave', id: source.id },
        })
        expect(f.actor.mana).toBe(0)
    })

    it('lets scripted clerics channel the same ability, preserves the first cast on repeated requests, and charges only the winner', () => {
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
        expect(f.actor.mana).toBe(100)
        expect(other.mana).toBe(120)
        expect(other.progression.skills.faith.practice).toBe(0)
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
        expect(f.actor.mana).toBe(120)
        expect(f.service.get(source.id)?.phase).toBe('active')
    })
})
