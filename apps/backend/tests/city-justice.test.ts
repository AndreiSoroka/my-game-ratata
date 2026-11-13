import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { resolvePendingAttackHit } from '../src/game/combat'
import { grantRetaliation, revokeRetaliation } from '../src/game/crimeRelations'
import { canTargetByFaction } from '../src/game/factions'
import { theftCharacter, theftFixture } from './theftFixtures'

function cityFixture() {
    const fixture = theftFixture()
    const guard = theftCharacter('npc_guard_1', { x: 150, y: 100 }, 'scripted')
    fixture.characters.push(guard)
    const report = (now = 1_100) =>
        fixture.service.handle(
            fixture.victim,
            { type: 'report_theft', targetId: fixture.actor.id },
            {
                characters: fixture.characters,
                navigation: fixture.navigation,
                now,
            }
        )
    return { ...fixture, guard, report }
}

describe('formal complaints use witnessed evidence across the region', () => {
    it('keeps formal evidence after an emergency call and records the living identity for longer than the pursuit', () => {
        const {
            actor,
            victim,
            characters,
            service,
            navigation,
            attempt,
            report,
        } = cityFixture()
        attempt([0])
        service.handle(
            victim,
            { type: 'call_guards', targetId: actor.id },
            { characters, navigation, now: 1_050 }
        )
        expect(
            service.snapshot(victim.id, victim.id, 1_050).accusations[0]
        ).toMatchObject({
            canCallGuards: false,
            reported: false,
            expiresAt: 301_000,
        })
        report(31_050)
        expect(service.snapshot(actor.id, actor.id, 400_000).blacklisted).toBe(
            true
        )
        expect(service.snapshot(actor.id, actor.id, 400_000).wantedMsLeft).toBe(
            0
        )
        expect(
            service.snapshot(victim.id, victim.id, 31_050).accusations[0]
                ?.reported
        ).toBe(true)
    })

    it.each(['offline', 'another location', 'downed'] as const)(
        'accepts a countryside theft complaint even while the thief is %s',
        (state) => {
            const { actor, victim, service, attempt, report } = cityFixture()
            actor.locationId = 'map-1-2'
            victim.locationId = actor.locationId
            attempt([0])
            victim.locationId = CENTER_LOCATION_ID
            if (state === 'offline') {
                actor.tags.add('offline')
            }
            if (state === 'another location') {
                actor.locationId = 'map-0-0'
            }
            if (state === 'downed') {
                actor.alive = false
            }
            report()
            expect(
                service.snapshot(actor.id, actor.id, 1_100).blacklisted
            ).toBe(true)
        }
    )

    it('preserves the record through being downed and revived but clears an irrevocably retired identity', () => {
        const { actor, service, room, characters, attempt, report } =
            cityFixture()
        attempt([0])
        report()
        actor.alive = false
        service.update(room, characters, 1_200)
        expect(service.snapshot(actor.id, actor.id, 1_200).blacklisted).toBe(
            true
        )
        actor.alive = true
        service.update(room, characters, 1_300)
        expect(service.snapshot(actor.id, actor.id, 1_300).blacklisted).toBe(
            true
        )
        actor.tags.add('state.retired')
        service.update(room, characters, 1_400)
        expect(service.snapshot(actor.id, actor.id, 1_400).blacklisted).toBe(
            false
        )
        const replacement = theftCharacter('new-identity')
        expect(
            service.snapshot(replacement.id, replacement.id, 1_400).blacklisted
        ).toBe(false)
        expect(actor.tags.has('city.blacklisted')).toBe(false)
    })
})

describe('formal complaint validation', () => {
    it.each([
        'no proof',
        'expired',
        'distant guard',
        'dead guard',
        'human guard',
        'wall',
        'victim dead',
        'victim offline',
        'victim stunned',
        'victim mute',
        'outside city',
        'retired thief',
    ] as const)('rejects %s without adding sanctions', (reason) => {
        const { actor, victim, guard, service, navigation, attempt, report } =
            cityFixture()
        if (reason !== 'no proof') {
            attempt([0])
        }
        let now = 1_100
        if (reason === 'expired') {
            now = 301_000
        }
        if (reason === 'distant guard') {
            guard.position.x = 300
        }
        if (reason === 'dead guard') {
            guard.alive = false
        }
        if (reason === 'human guard') {
            guard.soul.controlSource = 'human'
        }
        if (reason === 'wall') {
            navigation.grid.solid[6 * 30 + 8] = true
        }
        if (reason === 'victim dead') {
            victim.alive = false
        }
        if (reason === 'victim offline') {
            victim.tags.add('offline')
        }
        if (reason === 'victim stunned') {
            victim.stunUntil = 2_000
        }
        if (reason === 'victim mute') {
            victim.soul.canSpeak = false
        }
        if (reason === 'outside city') {
            victim.locationId = 'map-2-1'
        }
        if (reason === 'retired thief') {
            actor.tags.add('state.retired')
        }
        report(now)
        expect(service.snapshot(actor.id, actor.id, now).blacklisted).toBe(
            false
        )
        expect(actor.tags.has('city.blacklisted')).toBe(false)
    })
})

describe('guards enforce the city list through sight and common combat', () => {
    it('does not see through walls or across locations, then attacks a visible criminal through windup and damage', () => {
        const {
            actor,
            guard,
            service,
            room,
            navigation,
            characters,
            attempt,
            report,
            events,
        } = cityFixture()
        attempt([0])
        report()
        actor.position.x = 400
        expect(service.update(room, characters, 1_200).has(guard.id)).toBe(
            false
        )
        actor.position = { x: 112, y: 100 }
        navigation.grid.solid[6 * 30 + 8] = true
        expect(service.update(room, characters, 1_250).has(guard.id)).toBe(
            false
        )
        navigation.grid.solid[6 * 30 + 8] = false
        actor.locationId = 'map-2-1'
        expect(service.update(room, characters, 1_300).has(guard.id)).toBe(
            false
        )
        actor.locationId = guard.locationId
        actor.tags.add('offline')
        expect(service.update(room, characters, 1_350).has(guard.id)).toBe(
            false
        )
        actor.tags.delete('offline')
        actor.position.x = 140
        expect(service.update(room, characters, 1_400).has(guard.id)).toBe(true)
        expect(events).toContainEqual({ kind: 'attack', actorId: guard.id })
        const hp = actor.hp
        resolvePendingAttackHit({
            actor: guard,
            targets: characters,
            now: 1_450,
            tileSize: 16,
            respawnDelayMsFor: () => 15_000,
        })
        expect(actor.hp).toBeLessThan(hp)
        expect(guard.faction).toBe('peaceful')
        expect(
            canTargetByFaction(guard, theftCharacter('innocent'), 1_450)
        ).toBe(false)
    })

    it('never takes over a guard after its source switches to human control', () => {
        const { actor, guard, service, room, characters, attempt, report } =
            cityFixture()
        attempt([0])
        report()
        actor.position.x = 140
        guard.soul.controlSource = 'human'
        guard.setMoveInput({ x: 1, y: 0 })
        guard.setPath([{ x: 200, y: 100 }])
        const path = [...guard.path]
        const input = guard.getMoveInput()
        expect(service.update(room, characters, 1_200).has(guard.id)).toBe(
            false
        )
        expect(guard.getMoveInput()).toEqual(input)
        expect(guard.path).toEqual(path)
        expect(guard.pendingAttack).toBeUndefined()
    })
})

describe('the cause of a crime sanction belongs to the offender', () => {
    it('cannot ask the accused guard to arrest or officially blacklist itself', () => {
        const { victim, guard, service, navigation, characters } = cityFixture()
        guard.position = { x: 120, y: 100 }
        guard.movement.mode = 'sneaking'
        const context = { characters, navigation, now: 1_000, random: () => 0 }
        service.handle(guard, { type: 'steal', targetId: victim.id }, context)
        service.handle(
            victim,
            { type: 'call_guards', targetId: guard.id },
            context
        )
        service.handle(
            victim,
            { type: 'report_theft', targetId: guard.id },
            context
        )
        expect(service.snapshot(guard.id, guard.id, 1_000)).toMatchObject({
            blacklisted: false,
            wantedMsLeft: 0,
        })
        const otherGuard = theftCharacter(
            'second-guard',
            { x: 140, y: 100 },
            'scripted'
        )
        otherGuard.tags.add('guard')
        characters.push(otherGuard)
        service.handle(
            victim,
            { type: 'report_theft', targetId: guard.id },
            context
        )
        expect(service.snapshot(guard.id, guard.id, 1_000).blacklisted).toBe(
            true
        )
    })

    it('revokes a pardoned offender rights without forgiving a separate reciprocal crime', () => {
        const first = theftCharacter('first')
        const second = theftCharacter('second')
        grantRetaliation(first, second, 10_000)
        grantRetaliation(second, first, 5_000)
        revokeRetaliation(first, second)
        expect(canTargetByFaction(first, second, 6_000)).toBe(true)
        expect(canTargetByFaction(second, first, 6_000)).toBe(true)
        expect(canTargetByFaction(first, second, 10_000)).toBe(false)
    })
})
