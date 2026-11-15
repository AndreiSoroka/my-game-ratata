import type {
    CharacterAutoAction,
    GameEventPayload,
} from '@my-game-ratata/contracts'
import { GRAVE_PURIFY_CAST_MS } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { autoActionStatus } from '../src/game/autoActionRules'
import {
    advanceCharacterControl,
    type ControlWorld,
    setCharacterControl,
    snapshotControl,
} from '../src/game/characterControl'
import { advanceCharacter } from '../src/game/movement'
import {
    gravePrayerFixture,
    prayerNow as now,
    prayerSource as source,
} from './gravePrayerTestHelpers'

const action: CharacterAutoAction = {
    kind: 'prayer',
    intent: { mode: 'purify_grave', target: { kind: 'grave', id: source.id } },
}

it.each([49, 80])(
    'walks from %s px without paying, then starts the ordinary nearby ritual',
    (range) => {
        const f = gravePrayerFixture()
        f.actor.position = {
            x: source.position.x - range,
            y: source.position.y,
        }
        const events: GameEventPayload[] = []
        const world: ControlWorld = {
            getCharacter: (id) => f.characters.get(id),
            navigationFor: () => f.navigation,
            requestAttack: () => undefined,
            abilityContextFor: (_actor, at) => f.context(at),
            publishEvents: (outcomes) => events.push(...outcomes),
        }
        expect(autoActionStatus(f.actor, action, f.context(now))).toBe('range')
        expect(f.begin()[0]?.kind).toBe('notice')
        expect(f.actor.abilities.casting).toBeNull()
        expect(
            setCharacterControl(
                f.actor,
                { type: 'auto_action', action },
                world,
                now
            )
        ).toBe(true)
        let at = now
        for (
            ;
            at < now + 5_000 && f.actor.abilities.casting === null;
            at += 50
        ) {
            advanceCharacterControl(f.actor, world, at)
            if (events.every((event) => event.phase !== 'started')) {
                expect(snapshotControl(f.actor).waiting).toBe('range')
                expect(events).toEqual([])
            }
            expect(f.actor.mana).toBe(120)
            expect(f.actor.progression.skills.faith.practice).toBe(0)
            expect(f.actor.progression.skills.miracles.practice).toBe(0)
            advanceCharacter({
                character: f.actor,
                navigation: f.navigation,
                now: at,
                deltaMs: 50,
            })
            f.advance(at)
        }
        const cast = f.actor.abilities.casting
        if (cast?.mode !== 'purify_grave') {
            throw new Error('Approach did not start purification')
        }
        expect(f.actor.position.x).toBeGreaterThan(source.position.x - range)
        expect(
            Math.hypot(
                f.actor.position.x - source.position.x,
                f.actor.position.y - source.position.y
            )
        ).toBeLessThanOrEqual(48)
        expect(cast.completesAt - cast.startedAt).toBe(GRAVE_PURIFY_CAST_MS)
        expect(
            events.filter((event) => event.phase === 'started')
        ).toHaveLength(1)
        for (; at < cast.completesAt; at += 50) {
            advanceCharacterControl(f.actor, world, at)
            advanceCharacter({
                character: f.actor,
                navigation: f.navigation,
                now: at,
                deltaMs: 50,
            })
            f.advance(at)
            expect(f.actor.mana).toBe(120)
            expect(f.service.get(source.id)?.phase).toBe('active')
        }
        // Controllers run before lifecycle completion at the deadline.
        advanceCharacterControl(f.actor, world, cast.completesAt)
        expect(snapshotControl(f.actor).waiting).toBe('action')
        expect(f.advance(cast.completesAt)).toContainEqual({
            kind: 'grave_purification_progress',
            abilityId: 'pray',
            actorId: f.actor.id,
            target: { kind: 'grave', id: source.id },
        })
        expect(f.actor.mana).toBe(115)
        expect(f.actor.progression.skills.faith.practice).toBe(1)
        expect(f.actor.progression.skills.miracles.practice).toBe(1)
        let completedAt = cast.completesAt
        for (let step = 1; step < 5; step++) {
            advanceCharacterControl(f.actor, world, completedAt)
            const nextCast = f.actor.abilities.casting
            expect(nextCast).not.toBeNull()
            if (nextCast === null) {
                throw new Error('Automatic prayer did not repeat')
            }
            advanceCharacterControl(f.actor, world, nextCast.completesAt)
            expect(snapshotControl(f.actor).waiting).toBe('action')
            f.advance(nextCast.completesAt)
            completedAt = nextCast.completesAt
        }
        expect(f.service.get(source.id)?.phase).toBe('purified')
        expect(f.actor.mana).toBe(95)
        advanceCharacterControl(f.actor, world, completedAt + 1)
        expect(snapshotControl(f.actor).mode).toBe('none')
    }
)

it('does not approach an unseen, distant, purified or ineligible target', () => {
    const f = gravePrayerFixture()
    f.actor.position = { x: source.position.x - 80, y: source.position.y }
    for (let y = 0; y < 20; y++) {
        f.navigation.grid.solid[y * 20 + 9] = true
    }
    expect(autoActionStatus(f.actor, action, f.context(now))).toBe('stop')
    expect(f.begin()[0]?.kind).toBe('notice')
    f.navigation.grid.solid.fill(false)
    f.actor.position.x = source.position.x - 241
    expect(autoActionStatus(f.actor, action, f.context(now))).toBe('stop')
    f.actor.position.x = source.position.x - 80
    f.actor.abilities.known.delete('pray')
    expect(autoActionStatus(f.actor, action, f.context(now))).toBe('stop')
    f.actor.abilities.known.add('pray')
    f.service.purify(source.id, now)
    expect(autoActionStatus(f.actor, action, f.context(now))).toBe('stop')
    expect(f.actor.mana).toBe(120)
    expect(f.actor.progression.skills.faith.practice).toBe(0)
})
