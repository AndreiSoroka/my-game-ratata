import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolvePendingAttackHit } from '../src/game/combat'
import { canTargetByFaction } from '../src/game/factions'
import { createItemInstance } from '../src/game/inventory'
import { theftCharacter, theftFixture } from './theftFixtures'

afterEach(() => vi.restoreAllMocks())

describe('noticed theft and personal retaliation', () => {
    it('notifies a human victim and grants a temporary right to defend without changing their controls', () => {
        const { actor, victim, service, room, characters, attempt } =
            theftFixture()
        victim.setMoveInput({ x: 0, y: 1 })
        const input = victim.getMoveInput()
        const events = attempt([0])
        expect(actor.inventory).toEqual([])
        expect(victim.inventory).toHaveLength(1)
        expect(
            service.snapshot(actor.id, actor.id, 1_000).lastResult?.outcome
        ).toBe('caught')
        expect(
            events.some(
                (event) => event.audienceIds?.includes(victim.id) === true
            )
        ).toBe(true)
        expect(
            service.snapshot(victim.id, victim.id, 1_000).accusations
        ).toEqual([
            {
                thiefId: actor.id,
                thiefName: actor.nickname,
                expiresAt: 301_000,
                canCallGuards: true,
                reported: false,
            },
        ])
        expect(service.update(room, characters, 1_050).has(victim.id)).toBe(
            false
        )
        expect(victim.getMoveInput()).toEqual(input)
        expect(victim.pendingAttack).toBeUndefined()
        expect(canTargetByFaction(victim, actor, 1_050)).toBe(true)
        expect(canTargetByFaction(actor, victim, 1_050)).toBe(true)
        expect(
            canTargetByFaction(victim, theftCharacter('bystander'), 1_050)
        ).toBe(false)
        expect(canTargetByFaction(victim, actor, 31_000)).toBe(false)
        service.update(room, characters, 31_000)
        expect(victim.getMoveInput()).toEqual(input)
    })
    it('lets a fighter NPC retaliate through common windup, range and damage instead of changing faction', () => {
        const { actor, service, navigation, characters, room, events } =
            theftFixture()
        const veteran = theftCharacter(
            'veteran',
            { x: 112, y: 100 },
            'scripted'
        )
        veteran.inventory.push(createItemInstance('food'))
        veteran.soul.companion = {
            canFight: true,
            leaderId: null,
            lastReply: null,
            order: 'idle',
        }
        characters.push(veteran)
        service.handle(
            actor,
            { type: 'steal', targetId: veteran.id },
            { characters, navigation, now: 1_000, random: () => 0 }
        )
        vi.spyOn(Math, 'random').mockReturnValue(0.5)
        expect(service.update(room, characters, 1_000).has(veteran.id)).toBe(
            true
        )
        expect(events).toContainEqual({ kind: 'attack', actorId: veteran.id })
        expect(actor.hp).toBe(actor.maxHp)
        expect(veteran.faction).toBe('peaceful')
        const hits = resolvePendingAttackHit({
            actor: veteran,
            targets: characters,
            now: 1_050,
            tileSize: 16,
            respawnDelayMsFor: () => 15_000,
        })
        expect(
            hits.some(
                (event) =>
                    event.kind === 'damage' && event.targetId === actor.id
            )
        ).toBe(true)
        expect(actor.hp).toBeLessThan(actor.maxHp)
        expect(service.update(room, characters, 31_000).has(veteran.id)).toBe(
            false
        )
        expect(veteran.path).toEqual([])
    })
})

describe('civilian theft responses', () => {
    it('finds a real escape direction even when the thief stands exactly on the civilian', () => {
        const { actor, service, navigation, characters, room } = theftFixture()
        const civilian = theftCharacter(
            'civilian',
            { ...actor.position },
            'scripted'
        )
        civilian.inventory.push(createItemInstance('food'))
        characters.push(civilian)
        service.handle(
            actor,
            { type: 'steal', targetId: civilian.id },
            { characters, navigation, now: 1_000, random: () => 0 }
        )
        service.update(room, characters, 1_050)
        expect(civilian.path.length).toBeGreaterThan(0)
        expect(civilian.path.at(-1)).not.toEqual(civilian.position)
        expect(civilian.pendingAttack).toBeUndefined()
    })

    it('makes a speaking nonfighter flee and calls the real guard without giving the victim combat', () => {
        const { actor, service, navigation, characters, room } = theftFixture()
        const princess = theftCharacter(
            'npc_princess_1',
            { x: 112, y: 100 },
            'scripted'
        )
        princess.soul.companion = {
            canFight: false,
            leaderId: null,
            lastReply: null,
            order: 'idle',
        }
        princess.inventory.push(createItemInstance('food'))
        const guard = theftCharacter(
            'npc_guard_1',
            { x: 140, y: 100 },
            'scripted'
        )
        guard.soul.companion = {
            canFight: true,
            leaderId: null,
            lastReply: null,
            order: 'idle',
        }
        characters.push(princess, guard)
        const events = service.handle(
            actor,
            { type: 'steal', targetId: princess.id },
            { characters, navigation, now: 1_000, random: () => 0 }
        )
        expect(
            events.some(
                (event) => event.actorId === guard.id && event.kind === 'chat'
            )
        ).toBe(true)
        const reactions = service.update(room, characters, 1_050)
        expect(reactions.has(princess.id)).toBe(true)
        expect(reactions.has(guard.id)).toBe(true)
        expect(princess.pendingAttack).toBeUndefined()
        expect(princess.path.at(-1)?.x).toBeGreaterThan(princess.position.x)
        expect(guard.path.length).toBeGreaterThan(0)
        expect(service.snapshot(actor.id, actor.id, 1_050).wantedMsLeft).toBe(
            29_950
        )
        expect(canTargetByFaction(guard, actor, 1_050)).toBe(true)
    })
})

describe('guard accusations are proven, bounded and private', () => {
    it('allows a real human victim to call once while a stranger, stale proof and remote report are rejected', () => {
        const { actor, victim, service, characters, navigation, attempt } =
            theftFixture()
        const guard = theftCharacter(
            'npc_guard_1',
            { x: 140, y: 100 },
            'scripted'
        )
        const stranger = theftCharacter('stranger', { x: 108, y: 100 })
        characters.push(guard, stranger)
        attempt([0])
        const call = (caller: typeof actor, now: number) =>
            service.handle(
                caller,
                { type: 'call_guards', targetId: actor.id },
                { characters, navigation, now }
            )
        expect(
            call(stranger, 1_100).every(
                (event) => event.audienceIds?.includes(stranger.id) === true
            )
        ).toBe(true)
        expect(service.snapshot(actor.id, actor.id, 1_100).wantedMsLeft).toBe(0)
        victim.locationId = 'map-0-0'
        call(victim, 1_100)
        expect(service.snapshot(actor.id, actor.id, 1_100).wantedMsLeft).toBe(0)
        victim.locationId = actor.locationId
        expect(
            call(victim, 1_100).some((event) => event.actorId === guard.id)
        ).toBe(true)
        expect(call(victim, 1_101)).toEqual([])
        expect(
            service.snapshot(victim.id, victim.id, 1_100).accusations
        ).toMatchObject([{ canCallGuards: false, reported: false }])
        expect(
            call(victim, 31_000).some((event) => event.actorId === guard.id)
        ).toBe(false)
    })
    it('requires a present living audible guard and retains proof if nobody can respond', () => {
        const { actor, victim, service, characters, navigation, attempt } =
            theftFixture()
        attempt([0])
        service.handle(
            victim,
            { type: 'call_guards', targetId: actor.id },
            { characters, navigation, now: 1_100 }
        )
        expect(service.snapshot(actor.id, actor.id, 1_100).wantedMsLeft).toBe(0)
        expect(
            service.snapshot(victim.id, victim.id, 1_100).accusations
        ).toHaveLength(1)
    })
    it('uses higher theft and stealth skills to change the result of the same rolls', () => {
        const beginner = theftFixture()
        beginner.attempt([0.5, 0.5])
        expect(
            beginner.service.snapshot(
                beginner.actor.id,
                beginner.actor.id,
                1_000
            ).lastResult?.outcome
        ).toBe('caught')
        const trained = theftFixture()
        trained.actor.progression.skills.theft.level = 10
        trained.actor.progression.skills.stealth.level = 10
        trained.attempt([0.5, 0.5])
        expect(
            trained.service.snapshot(trained.actor.id, trained.actor.id, 1_000)
                .lastResult?.outcome
        ).toBe('stolen')
    })
})

describe('crime lifecycle cleanup', () => {
    it.each(['offline', 'dead', 'retired', 'other map', 'missing'] as const)(
        'ends NPC retaliation when the thief is %s',
        (reason) => {
            const { actor, service, characters, navigation, room } =
                theftFixture()
            const veteran = theftCharacter(
                'veteran',
                { x: 120, y: 100 },
                'scripted'
            )
            veteran.soul.companion = {
                canFight: true,
                leaderId: null,
                lastReply: null,
                order: 'idle',
            }
            veteran.inventory.push(createItemInstance('food'))
            characters.push(veteran)
            service.handle(
                actor,
                { type: 'steal', targetId: veteran.id },
                { characters, navigation, now: 1_000, random: () => 0 }
            )
            expect(
                service.update(room, characters, 1_000).has(veteran.id)
            ).toBe(true)
            if (reason === 'offline') {
                actor.tags.add('offline')
            }
            if (reason === 'dead') {
                actor.alive = false
            }
            if (reason === 'retired') {
                actor.tags.add('state.retired')
            }
            if (reason === 'other map') {
                actor.locationId = 'map-0-0'
            }
            if (reason === 'missing') {
                characters.splice(characters.indexOf(actor), 1)
            }
            expect(
                service.update(room, characters, 1_050).has(veteran.id)
            ).toBe(false)
            expect(veteran.path).toEqual([])
            expect(veteran.getMoveInput()).toEqual({ x: 0, y: 0 })
        }
    )
    it('gives a replacement identity no inherited accusation, wanted state or theft cooldown', () => {
        const { actor, victim, service, characters, navigation, attempt } =
            theftFixture()
        attempt([0])
        const replacementThief = theftCharacter('new-thief')
        const replacementVictim = theftCharacter('new-victim')
        for (const replacement of [replacementThief, replacementVictim]) {
            expect(
                service.snapshot(replacement.id, replacement.id, 1_100)
            ).toEqual({
                cooldownMsLeft: 0,
                wantedMsLeft: 0,
                blacklisted: false,
                accusations: [],
                lastResult: null,
            })
        }
        expect(
            service.snapshot(victim.id, replacementVictim.id, 1_100).accusations
        ).toEqual([])
        const result = service.handle(
            replacementVictim,
            { type: 'call_guards', targetId: actor.id },
            {
                characters: [...characters, replacementVictim],
                navigation,
                now: 1_100,
            }
        )
        expect(result[0]?.text).toContain('Нет свежего')
        expect(canTargetByFaction(victim, replacementThief, 1_100)).toBe(false)
    })
})

describe('crime respects human control independently of controller kind', () => {
    it('keeps a human-controlled scripted victim in control while preserving proof and defense rights', () => {
        const { actor, service, navigation, characters, room } = theftFixture()
        const victim = theftCharacter(
            'human-source',
            { x: 112, y: 100 },
            'scripted'
        )
        victim.soul.controlSource = 'human'
        victim.inventory.push(createItemInstance('food'))
        const guard = theftCharacter(
            'npc_guard_1',
            { x: 140, y: 100 },
            'scripted'
        )
        characters.push(victim, guard)
        victim.setMoveInput({ x: 0, y: 1 })
        victim.setPath([{ x: 200, y: 200 }])
        const path = [...victim.path]
        const input = victim.getMoveInput()
        const events = service.handle(
            actor,
            { type: 'steal', targetId: victim.id },
            {
                characters,
                navigation,
                now: 1_000,
                random: () => 0,
            }
        )
        expect(events.some((event) => event.kind === 'chat')).toBe(false)
        expect(service.update(room, characters, 1_050).size).toBe(0)
        expect(victim.path).toEqual(path)
        expect(victim.getMoveInput()).toEqual(input)
        expect(victim.pendingAttack).toBeUndefined()
        expect(canTargetByFaction(victim, actor, 1_050)).toBe(true)
        expect(
            service.snapshot(victim.id, victim.id, 1_050).accusations
        ).toHaveLength(1)
        expect(service.snapshot(actor.id, actor.id, 1_050).wantedMsLeft).toBe(0)
        const call = service.handle(
            victim,
            { type: 'call_guards', targetId: actor.id },
            {
                characters,
                navigation,
                now: 1_100,
            }
        )
        expect(call.some((event) => event.actorId === guard.id)).toBe(true)
        expect(service.update(room, characters, 1_150).has(victim.id)).toBe(
            false
        )
        expect(victim.path).toEqual(path)
    })

    it('releases an active NPC reaction without clearing the new human controller path or input', () => {
        const { actor, service, navigation, characters, room } = theftFixture()
        const victim = theftCharacter(
            'civilian',
            { x: 112, y: 100 },
            'scripted'
        )
        victim.inventory.push(createItemInstance('food'))
        characters.push(victim)
        service.handle(
            actor,
            { type: 'steal', targetId: victim.id },
            {
                characters,
                navigation,
                now: 1_000,
                random: () => 0,
            }
        )
        expect(service.update(room, characters, 1_050).has(victim.id)).toBe(
            true
        )
        victim.soul.controlSource = 'human'
        victim.setMoveInput({ x: 0, y: 1 })
        victim.setPath([{ x: 200, y: 200 }])
        const path = [...victim.path]
        const input = victim.getMoveInput()
        expect(service.update(room, characters, 1_100).has(victim.id)).toBe(
            false
        )
        expect(victim.path).toEqual(path)
        expect(victim.getMoveInput()).toEqual(input)
        expect(victim.pendingAttack).toBeUndefined()
        service.update(room, characters, 31_000)
        expect(victim.path).toEqual(path)
    })
})
