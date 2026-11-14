import {
    CENTER_LOCATION_ID,
    PURSUIT_RULES,
    type TheftClientMessage,
} from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import {
    applyAgentDecision,
    type CompanionWorld,
} from '../src/game/agentDecisions'
import { GameCharacter } from '../src/game/character'
import { retireCharacter } from '../src/game/characterLife'
import { restoreCharacter } from '../src/game/characterRecovery'
import { resolvePendingAttackHit } from '../src/game/combat'
import { canTargetByFaction } from '../src/game/factions'
import { theftCharacter, theftFixture } from './theftFixtures'

function lawFixture() {
    const fixture = theftFixture()
    const { actor, victim, characters, service, navigation } = fixture
    const adventure = new AdventureService({ now: () => 1_000 })
    const guard = theftCharacter('npc_guard_1', { x: 140, y: 100 }, 'scripted')
    const cleric = theftCharacter(
        'npc_cleric_1',
        { x: 116, y: 120 },
        'scripted'
    )
    guard.tags.add('guard')
    cleric.tags.add('cleric')
    characters.push(guard, cleric)
    const command = (
        caller: GameCharacter,
        message: TheftClientMessage,
        now = 1_100
    ) =>
        service.handle(caller, message, {
            characters,
            navigation,
            adventure,
            now,
        })
    const report = () => {
        fixture.attempt([0])
        command(victim, { type: 'report_theft', targetId: actor.id })
        expect(actor.tags.has('city.blacklisted')).toBe(true)
    }
    const balance = (id = actor.id) => adventure.snapshot(id).gold
    const pardon = (now = 1_200) =>
        command(actor, { type: 'absolve', targetId: cleric.id }, now)
    return {
        ...fixture,
        adventure,
        guard,
        cleric,
        command,
        report,
        balance,
        pardon,
    }
}

afterEach(() => vi.restoreAllMocks())

describe('city trade blacklist integration', () => {
    it.each(['npc_merchant_1', 'npc_friendly_girl_1'])(
        'blocks %s even when its shop was opened before the report',
        (merchantId) => {
            const { actor, characters, adventure, report, balance, pardon } =
                lawFixture()
            const merchant = theftCharacter(
                merchantId,
                { x: 116, y: 100 },
                'scripted'
            )
            characters.push(merchant)
            adventure.grantGoldOnce(actor.id, 35, 'review-capital')
            adventure.interact(actor, merchant.id, characters)
            expect(adventure.snapshot(actor.id).dialogue?.canTrade).toBe(true)
            expect(
                adventure.snapshot(actor.id).dialogue?.tradeBlockedReason
            ).toBeUndefined()
            report()
            const inventory = [...actor.inventory]
            expect(
                adventure.snapshot(actor.id).dialogue?.tradeBlockedReason
            ).toContain('книге')
            adventure.trade(actor, 'food', characters)
            adventure.choose(actor, 'trade', characters)
            adventure.trade(actor, 'food', characters)
            expect(actor.inventory).toEqual(inventory)
            expect(balance()).toBe(35)
            pardon()
            expect(balance()).toBe(5)
            expect(
                adventure.snapshot(actor.id).dialogue?.tradeBlockedReason
            ).toBeUndefined()
            const foodPrice =
                adventure
                    .snapshot(actor.id)
                    .market?.rows.find((row) => row.itemId === 'food')
                    ?.buyPrice ?? 0
            adventure.trade(actor, 'food', characters)
            expect(actor.inventory).toHaveLength(inventory.length + 1)
            expect(balance()).toBe(5 - foodPrice)
        }
    )
})

describe('atomic absolution payments and receipts', () => {
    it('rejects 29 gold, charges exactly 30 once, and cannot reuse an old report after absolution', () => {
        const {
            actor,
            victim,
            service,
            adventure,
            report,
            balance,
            pardon,
            command,
        } = lawFixture()
        report()
        adventure.grantGoldOnce(actor.id, 29, 'review-capital')
        pardon()
        expect(balance()).toBe(29)
        expect(actor.tags.has('city.blacklisted')).toBe(true)
        adventure.grantGoldOnce(actor.id, 1, 'review-top-up')
        pardon()
        expect(balance()).toBe(0)
        expect(actor.tags.has('city.blacklisted')).toBe(false)
        expect(service.snapshot(actor.id, actor.id, 1_200).blacklisted).toBe(
            false
        )
        adventure.grantGoldOnce(actor.id, 30, 'review-new-earnings')
        pardon(1_201)
        command(victim, { type: 'report_theft', targetId: actor.id }, 1_202)
        pardon(1_203)
        expect(balance()).toBe(30)
        expect(actor.tags.has('city.blacklisted')).toBe(false)
        expect(
            service.snapshot(victim.id, victim.id, 1_203).accusations
        ).toEqual([])
    })

    it('keeps formal reporting available after an emergency call has consumed the call action', () => {
        const { actor, victim, command, service, attempt } = lawFixture()
        attempt([0])
        command(victim, { type: 'call_guards', targetId: actor.id }, 1_100)
        expect(service.snapshot(actor.id, actor.id, 1_100).blacklisted).toBe(
            false
        )
        expect(
            service.snapshot(victim.id, victim.id, 1_100).accusations[0]
        ).toMatchObject({ canCallGuards: false, reported: false })
        command(victim, { type: 'report_theft', targetId: actor.id }, 2_000)
        expect(service.snapshot(actor.id, actor.id, 2_000).blacklisted).toBe(
            true
        )
    })

    it.each([
        'wrong NPC',
        'dead',
        'offline',
        'far',
        'other map',
        'wall',
        'self',
        'human controlled',
    ] as const)('does not debit or pardon through a %s cleric', (reason) => {
        const {
            actor,
            characters,
            cleric,
            navigation,
            adventure,
            report,
            balance,
            command,
        } = lawFixture()
        report()
        adventure.grantGoldOnce(actor.id, 30, 'review-capital')
        let targetId = cleric.id
        if (reason === 'wrong NPC') {
            const citizen = theftCharacter(
                'ordinary-citizen',
                { x: 116, y: 100 },
                'scripted'
            )
            characters.push(citizen)
            targetId = citizen.id
        }
        if (reason === 'dead') {
            cleric.alive = false
        }
        if (reason === 'offline') {
            cleric.tags.add('offline')
        }
        if (reason === 'far') {
            cleric.position = { x: 260, y: 100 }
        }
        if (reason === 'other map') {
            cleric.locationId = 'map-0-0'
        }
        if (reason === 'wall') {
            cleric.position = { x: 132, y: 100 }
            navigation.grid.solid[6 * navigation.grid.width + 7] = true
        }
        if (reason === 'self') {
            actor.tags.add('cleric')
            targetId = actor.id
        }
        if (reason === 'human controlled') {
            cleric.soul.controlSource = 'human'
        }
        command(actor, { type: 'absolve', targetId }, 1_200)
        expect(balance()).toBe(30)
        expect(actor.tags.has('city.blacklisted')).toBe(true)
    })
})

describe('guard attacks after a paid pardon', () => {
    it('revokes the old right and prevents an already queued guard strike from damaging the pardoned actor', () => {
        const {
            actor,
            guard,
            characters,
            navigation,
            adventure,
            service,
            room,
            report,
            pardon,
            balance,
        } = lawFixture()
        report()
        adventure.grantGoldOnce(actor.id, 30, 'review-capital')
        guard.position = { x: 112, y: 100 }
        vi.spyOn(Math, 'random').mockReturnValue(0.5)
        expect(service.update(room, characters, 1_200).has(guard.id)).toBe(true)
        const hitAt = guard.pendingAttack?.hitAt
        if (hitAt === undefined) {
            throw new Error(
                'The real guard combat pipeline did not queue an attack'
            )
        }
        expect(hitAt).toBeGreaterThan(1_200)
        expect(canTargetByFaction(guard, actor, 1_200)).toBe(true)
        const before = actor.hp
        pardon(1_201)
        expect(balance()).toBe(0)
        expect(canTargetByFaction(guard, actor, hitAt)).toBe(false)
        const events = resolvePendingAttackHit({
            actor: guard,
            targets: characters,
            now: hitAt,
            tileSize: navigation.grid.tileWidth,
            respawnDelayMsFor: () => 15_000,
        })
        expect(
            events.some(
                (event) =>
                    event.kind === 'damage' && event.targetId === actor.id
            )
        ).toBe(false)
        expect(actor.hp).toBe(before)
        expect(service.update(room, characters, hitAt + 1).has(guard.id)).toBe(
            true
        )
        const destination = guard.remainingPath().at(-1)
        if (destination === undefined) {
            throw new Error('The pardoned guard has no ordinary homeward path')
        }
        expect(
            Math.hypot(
                destination.x - guard.spawnPosition.x,
                destination.y - guard.spawnPosition.y
            )
        ).toBeLessThanOrEqual(PURSUIT_RULES.homeArrivalRadius)
        expect(guard.pendingAttack).toBeUndefined()
        expect(canTargetByFaction(guard, actor, hitAt + 1)).toBe(false)
    })
})

describe('sanctions belong to a persistent character identity', () => {
    it('preserves the blacklist through downing, revival, logout, travel and expiry of the temporary pursuit window', () => {
        const { actor, characters, service, room, report } = lawFixture()
        report()
        actor.applyDamage(actor.hp, 1_300)
        service.update(room, characters, 1_350)
        expect(actor.tags.has('city.blacklisted')).toBe(true)
        expect(service.snapshot(actor.id, actor.id, 1_350).blacklisted).toBe(
            true
        )
        restoreCharacter(actor, 1_400, false)
        actor.tags.add('offline')
        service.update(room, characters, 1_450)
        expect(service.snapshot(actor.id, actor.id, 1_450).blacklisted).toBe(
            true
        )
        actor.tags.delete('offline')
        actor.locationId = 'map-0-0'
        service.update(room, characters, 40_000)
        expect(service.snapshot(actor.id, actor.id, 40_000).blacklisted).toBe(
            true
        )
        actor.locationId = CENTER_LOCATION_ID
        service.update(room, characters, 400_000)
        expect(service.snapshot(actor.id, actor.id, 400_000).blacklisted).toBe(
            true
        )
    })

    it('starts a genuinely new identity clean after permanent death even when its nickname is reused', () => {
        const { actor, characters, service, adventure, room, report } =
            lawFixture()
        report()
        adventure.grantGoldOnce(actor.id, 30, 'review-capital')
        actor.applyDamage(actor.hp, 1_300)
        const retired = retireCharacter(actor)
        adventure.observe([retired], (id) =>
            characters.find((character) => character.id === id)
        )
        service.update(room, characters, 70_000)
        characters.splice(characters.indexOf(actor), 1)
        const replacement = new GameCharacter({
            id: 'new-identity',
            nickname: actor.nickname,
            archetype: 'human',
            controllerKind: 'network_player',
            faction: 'peaceful',
            spawnPosition: { x: 100, y: 100 },
        })
        characters.push(replacement)
        service.update(room, characters, 70_050)
        expect(replacement.id).not.toBe(actor.id)
        expect(replacement.nickname).toBe(actor.nickname)
        expect(
            service.snapshot(replacement.id, replacement.id, 70_050)
        ).toMatchObject({
            blacklisted: false,
            cooldownMsLeft: 0,
            wantedMsLeft: 0,
            accusations: [],
            lastResult: null,
        })
        expect(adventure.snapshot(replacement.id).gold).toBe(0)
        expect(replacement.tags.has('city.blacklisted')).toBe(false)
    })
})

describe('model control uses the same debt and proximity rules', () => {
    it('cannot bypass an NPC criminal identity by switching control source and pays from that NPC wallet', () => {
        const {
            victim,
            characters,
            service,
            navigation,
            adventure,
            room,
            cleric,
            command,
        } = lawFixture()
        const npc = theftCharacter(
            'model-thief',
            { x: 100, y: 100 },
            'scripted'
        )
        npc.movement.mode = 'sneaking'
        characters.push(npc)
        service.handle(
            npc,
            { type: 'steal', targetId: victim.id },
            { characters, navigation, adventure, now: 1_000, random: () => 0 }
        )
        command(victim, { type: 'report_theft', targetId: npc.id })
        adventure.grantGoldOnce(npc.id, 30, 'review-npc-capital')
        npc.soul.controlSource = 'model'
        const world: CompanionWorld = {
            getCharacter: (id) =>
                characters.find((character) => character.id === id),
            navigationFor: () => navigation,
            findVisibleTarget: () => undefined,
            requestAttack: (attacker, now) => room.requestAttack(attacker, now),
            requestTheft: (criminal, message, now) =>
                command(criminal, message, now),
        }
        expect(
            applyAgentDecision(npc, { type: 'wait' }, world, 1_200).accepted
        ).toBe(true)
        expect(npc.tags.has('city.blacklisted')).toBe(true)
        cleric.position = { x: 260, y: 100 }
        applyAgentDecision(
            npc,
            { type: 'absolve', targetId: cleric.id },
            world,
            1_210
        )
        expect(npc.tags.has('city.blacklisted')).toBe(true)
        expect(adventure.snapshot(npc.id).gold).toBe(30)
        cleric.position = { x: 116, y: 120 }
        applyAgentDecision(
            npc,
            { type: 'absolve', targetId: cleric.id },
            world,
            1_220
        )
        expect(npc.tags.has('city.blacklisted')).toBe(false)
        expect(adventure.snapshot(npc.id).gold).toBe(0)
        expect(adventure.snapshot(victim.id).gold).toBe(0)
    })
})
