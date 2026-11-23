import { CENTER_LOCATION_ID, THEFT_RULES } from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import { resolveCharacterDamage } from '../src/game/abilityDamage'
import type { GameCharacter } from '../src/game/character'
import type {
    ReactionAction,
    ReactionTrigger,
} from '../src/game/characterReactions'
import {
    grantRetaliation,
    hasDirectRetaliationRight,
    markDamageRetaliation,
} from '../src/game/crimeRelations'
import { canTargetByFaction } from '../src/game/factions'
import { createItemInstance } from '../src/game/inventory'
import {
    advanceNpcCrimeReport,
    type ReportResponse,
} from '../src/game/npcCrimeReport'
import { npc, registerConflictFixture } from './npcConflictFixtures'
import { joinScenarioRoom } from './scenarioRoomHelpers'

const setup = registerConflictFixture()

it('walks to a guard before filing an official report of a personally caught theft', () => {
    const f = setup()
    const decision = choose(f.merchant, 'theft', 'report')
    vi.spyOn(Math, 'random').mockReturnValue(0)
    f.merchant.inventory.push(createItemInstance('food'))
    f.player.send({ type: 'movement_mode', mode: 'sneaking' })
    f.player.send({ type: 'steal', targetId: f.merchant.id })

    expect(decision).toHaveBeenCalledOnce()
    expect(
        f.player.sent.flatMap((message) =>
            message.type === 'event' &&
            message.event.text === 'Попытку кражи заметили.'
                ? [message.event.actorId]
                : []
        )
    ).toEqual([f.player.actor.id])
    expect(f.knownBy(f.merchant)).toMatchObject([
        { kind: 'theft', firsthand: true },
    ])
    expect(f.knownBy(f.guard)).toEqual([])
    expect(f.player.actor.tags.has('city.blacklisted')).toBe(false)
    const conflict = f.game.social.society.conflicts
    expect(
        conflict?.availableForSpeech(
            f.merchant,
            f.player.actor,
            Date.now(),
            'threat'
        )
    ).toEqual(['wait'])
    conflict?.apply(
        f.merchant,
        f.player.actor,
        'wait',
        {
            id: 'report-interruption',
            kind: 'threat',
            locationId: CENTER_LOCATION_ID,
        },
        Date.now()
    )
    vi.advanceTimersByTime(150)
    expect(f.merchant.position.x).toBeGreaterThan(80)
    expect(f.player.actor.tags.has('city.blacklisted')).toBe(false)
    vi.advanceTimersByTime(1_150)
    expect(f.player.actor.tags.has('city.blacklisted')).toBe(true)
    expect(f.merchant.position.x).toBeGreaterThanOrEqual(
        f.guard.position.x - THEFT_RULES.reportRange
    )
})

it.each(['human', 'silent NPC'] as const)(
    'keeps the additional caught-theft notice private from the thief for a %s victim',
    (victimKind) => {
        const f = setup()
        const victim =
            victimKind === 'human'
                ? joinScenarioRoom(f.game, 'Human victim').actor
                : f.merchant
        victim.position = { x: 80, y: 80 }
        if (victimKind === 'silent NPC') {
            victim.soul.canSpeak = false
        }
        victim.inventory.push(createItemInstance('food'))
        vi.spyOn(Math, 'random').mockReturnValue(0)
        f.player.send({ type: 'movement_mode', mode: 'sneaking' })
        f.player.send({ type: 'steal', targetId: victim.id })

        const notices = f.player.sent.flatMap((message) =>
            message.type === 'event' ? [message.event.text] : []
        )
        expect(notices).toContain('Тебя заметили! Кража сорвалась.')
        expect(notices).not.toContain('Попытку кражи заметили.')
    }
)

it.each(['wait', 'warn'] as const)(
    'finishes walking to file the old complaint after choosing %s for a new assault',
    (action) => {
        const f = setup()
        const theftDecision = choose(f.merchant, 'theft', 'report')
        vi.spyOn(Math, 'random').mockReturnValue(0)
        f.merchant.inventory.push(createItemInstance('food'))
        f.player.send({ type: 'movement_mode', mode: 'sneaking' })
        f.player.send({ type: 'steal', targetId: f.merchant.id })
        vi.advanceTimersByTime(150)
        expect(f.merchant.position.x).toBeGreaterThan(80)
        expect(f.player.actor.tags.has('city.blacklisted')).toBe(false)
        theftDecision.mockRestore()

        const attacker = npc(f.game, 'npc_veteran_1')
        attacker.position = {
            x: f.merchant.position.x - 8,
            y: f.merchant.position.y,
        }
        const decision = choose(f.merchant, 'attack', action)
        const damage = resolveCharacterDamage({
            actor: attacker,
            target: f.merchant,
            damageKind: 'physical',
            amount: 3,
            now: Date.now(),
            respawnDelayMs: 1000,
        })
        f.game.publishEvents(damage.events)
        expect(f.merchant.hp).toBeLessThan(f.merchant.maxHp)
        expect(
            decision.mock.calls.some(
                ([request]) => request.trigger === 'attack'
            )
        ).toBe(true)

        vi.advanceTimersByTime(1_200)
        expect(f.player.actor.tags.has('city.blacklisted')).toBe(true)
        expect(attacker.tags.has('city.blacklisted')).toBe(false)
    }
)

it('uses personal hostility for an NPC strike without making the strike lawful', () => {
    const f = setup()
    const actor = npc(f.game, 'npc_princess_1')
    actor.position = { x: 72, y: 80 }
    f.player.actor.position.y = 150
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    choose(f.merchant, 'attack', 'report')
    const cause = {
        id: 'direct-threat',
        kind: 'threat' as const,
        locationId: actor.locationId,
    }
    const conflict = f.game.social.society.conflicts
    expect(
        conflict?.availableForSpeech(actor, f.merchant, Date.now(), 'threat')
    ).not.toContain('report')
    conflict?.apply(actor, f.merchant, 'attack', cause, Date.now())

    expect(hasDirectRetaliationRight(actor, f.merchant, Date.now())).toBe(false)
    expect(actor.tags.has('city.blacklisted')).toBe(false)
    vi.advanceTimersByTime(50)
    expect(canTargetByFaction(actor, f.merchant, Date.now())).toBe(true)
    vi.advanceTimersByTime(150)
    expect(f.merchant.hp).toBeLessThan(f.merchant.maxHp)
    expect(f.knownBy(f.merchant)).toMatchObject([
        { kind: 'attack', firsthand: true },
    ])
    expect(actor.tags.has('city.blacklisted')).toBe(false)
    vi.advanceTimersByTime(1_600)
    expect(actor.tags.has('city.blacklisted')).toBe(true)
})

it('filters attack against the current companion leader at selection and commit', () => {
    const f = setup()
    const actor = npc(f.game, 'npc_princess_1')
    const leader = f.player.actor
    actor.position = { x: 80, y: 80 }
    if (actor.soul.companion === null) {
        throw new Error('Missing companion state')
    }
    actor.soul.companion.leaderId = leader.id
    const conflict = f.game.social.society.conflicts
    expect(
        conflict?.availableForSpeech(actor, leader, Date.now(), 'threat')
    ).not.toContain('attack')
    conflict?.apply(
        actor,
        leader,
        'attack',
        {
            id: 'addressed-threat',
            kind: 'threat',
            locationId: actor.locationId,
        },
        Date.now()
    )
    expect(conflict?.hasPhysicalReaction(actor, Date.now())).toBe(false)
    expect(canTargetByFaction(actor, leader, Date.now())).toBe(false)
})

it.each(['direct', 'derived'] as const)(
    'keeps a guard with %s authority out of assault evidence and rumors',
    (right) => {
        const f = setup()
        const thief = f.player.actor
        f.guard.position = { x: 80, y: 80 }
        const [defender, offender] =
            right === 'direct' ? [f.guard, thief] : [thief, f.guard]
        grantRetaliation(
            defender,
            offender,
            Date.now() + THEFT_RULES.retaliationMs
        )
        vi.spyOn(Math, 'random').mockReturnValue(0.9)
        f.game.requestAttack(f.guard, Date.now(), thief.id)
        vi.advanceTimersByTime(50)
        expect(thief.hp).toBeLessThan(thief.maxHp)
        expect(
            f.knownBy(thief).filter(({ kind }) => kind === 'attack')
        ).toEqual([])
        expect(
            f.knownBy(f.merchant).filter(({ kind }) => kind === 'attack')
        ).toEqual([])
    }
)

it('does not turn a civilian defending themself into a new assault incident', () => {
    const f = setup()
    const thief = f.player.actor
    grantRetaliation(f.merchant, thief, Date.now() + THEFT_RULES.retaliationMs)
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    f.game.requestAttack(f.merchant, Date.now(), thief.id)
    vi.advanceTimersByTime(50)
    expect(thief.hp).toBeLessThan(thief.maxHp)
    expect(f.knownBy(thief).filter(({ kind }) => kind === 'attack')).toEqual([])
    expect(f.knownBy(f.guard).filter(({ kind }) => kind === 'attack')).toEqual(
        []
    )
    expect(hasDirectRetaliationRight(thief, f.merchant, Date.now())).toBe(false)
})

it('does not treat an accused guard as a report destination, including on arrival', () => {
    const f = setup()
    const accused = f.guard
    accused.position = { x: 92, y: 80 }
    const chooseWait = choose(f.merchant, 'attack', 'wait')
    f.game.publishEvents([
        markDamageRetaliation(
            {
                eventId: 'unguarded-misconduct',
                kind: 'damage',
                actorId: accused.id,
                targetId: f.merchant.id,
                amount: 3,
            },
            false
        ),
    ])
    expect(chooseWait.mock.calls[0]?.[0].available).not.toContain('report')

    const legitimate = npc(f.game, 'npc_veteran_1')
    legitimate.tags.add('guard')
    legitimate.position = { x: 184, y: 80 }
    const characters = new Map(
        f.game.charactersFor(f.merchant).map((actor) => [actor.id, actor])
    )
    const journey: ReportResponse = {
        mode: 'report',
        guardId: accused.id,
        offenderId: accused.id,
        offense: 'attack',
        locationId: CENTER_LOCATION_ID,
        lastPlanAt: 0,
        until: Date.now() + 1000,
    }
    const report = vi.fn(() => [])
    expect(
        advanceNpcCrimeReport(
            f.game,
            f.merchant,
            journey,
            characters,
            Date.now(),
            report
        )
    ).toBe(true)
    expect(journey.guardId).toBe(legitimate.id)
    expect(report).not.toHaveBeenCalled()
})

it('uses only public observed contacts to establish attack evidence', () => {
    const f = setup()
    const action = {
        kind: 'damage' as const,
        actorId: f.player.actor.id,
        targetId: f.merchant.id,
        amount: 3,
        eventId: 'fixture-hit',
    }
    const selected = choose(f.merchant, 'attack', 'wait')
    const lineOfSight = vi
        .spyOn(f.game.navigationFor(f.merchant), 'hasLineOfSight')
        .mockReturnValue(false)
    const hidden = { ...action, eventId: 'hidden-hit' }
    f.game.publishEvents([hidden])
    lineOfSight.mockRestore()
    f.game.publishEvents([hidden])
    f.game.publishEvents([{ ...action, audienceIds: [f.player.actor.id] }])
    expect(f.knownBy(f.merchant)).toEqual([])
    expect(selected).not.toHaveBeenCalled()

    f.guard.position = { x: 480, y: 480 }
    f.game.publishEvents([markDamageRetaliation(action, false)])
    f.guard.position = { x: 112, y: 80 }
    f.game.publishEvents([action])
    expect(f.knownBy(f.merchant)).toHaveLength(1)
    expect(selected).toHaveBeenCalledOnce()
    expect(f.knownBy(f.guard)).toEqual([])
    expect(
        hasDirectRetaliationRight(f.merchant, f.player.actor, Date.now())
    ).toBe(true)
    expect(
        hasDirectRetaliationRight(f.player.actor, f.merchant, Date.now())
    ).toBe(false)
})

it('absolution removes pending reconsideration for the old theft', () => {
    const f = setup()
    f.guard.tags.add('offline')
    const selected = choose(f.merchant, 'theft', 'wait')
    vi.spyOn(Math, 'random').mockReturnValue(0)
    f.merchant.inventory.push(createItemInstance('food'))
    f.player.send({ type: 'movement_mode', mode: 'sneaking' })
    f.player.send({ type: 'steal', targetId: f.merchant.id })
    const cleric = npc(f.game, 'npc_cleric_1')
    cleric.position = { x: 72, y: 120 }
    f.player.actor.tags.add('city.blacklisted')
    f.game.adventureForWorkers().walletFor(f.player.actor.id).gold = 30
    f.player.send({ type: 'absolve', targetId: cleric.id })
    expect(f.player.actor.tags.has('city.blacklisted')).toBe(false)
    expect(
        hasDirectRetaliationRight(f.merchant, f.player.actor, Date.now())
    ).toBe(false)
    f.guard.tags.delete('offline')
    vi.spyOn(f.game.navigationFor(f.merchant), 'findPathWorld').mockReturnValue(
        []
    )
    vi.advanceTimersByTime(1_500)
    expect(
        selected.mock.calls.flatMap(([request]) =>
            request.trigger === 'theft' ? [request.revision] : []
        )
    ).toEqual([0])
    expect(canTargetByFaction(f.merchant, f.player.actor, Date.now())).toBe(
        false
    )
})

it('reconsiders once when a guard becomes available and once when escape closes', () => {
    const f = setup()
    f.guard.tags.add('offline')
    const decision = choose(f.merchant, 'theft', 'wait')
    const revisions = () =>
        decision.mock.calls.flatMap(([request]) =>
            request.trigger === 'theft' ? [request.revision] : []
        )
    vi.spyOn(Math, 'random').mockReturnValue(0)
    f.merchant.inventory.push(createItemInstance('food'))
    f.player.send({ type: 'movement_mode', mode: 'sneaking' })
    f.player.send({ type: 'steal', targetId: f.merchant.id })
    vi.advanceTimersByTime(1_000)
    expect(revisions()).toEqual([0])

    f.guard.tags.delete('offline')
    vi.advanceTimersByTime(500)
    expect(revisions()).toEqual([0, 'guard_available'])
    f.guard.tags.add('offline')
    vi.advanceTimersByTime(500)
    f.guard.tags.delete('offline')
    vi.advanceTimersByTime(500)
    expect(revisions()).toEqual([0, 'guard_available'])

    vi.spyOn(f.game.navigationFor(f.merchant), 'findPathWorld').mockReturnValue(
        []
    )
    vi.advanceTimersByTime(1_000)
    expect(revisions()).toEqual([0, 'guard_available', 'escape_blocked'])
})

it('keeps a new physical speech reaction ahead of older theft reconsideration', () => {
    const f = setup()
    f.guard.tags.add('offline')
    const earlier = choose(f.merchant, 'theft', 'wait')
    vi.spyOn(Math, 'random').mockReturnValue(0)
    f.merchant.inventory.push(createItemInstance('food'))
    f.player.send({ type: 'movement_mode', mode: 'sneaking' })
    f.player.send({ type: 'steal', targetId: f.merchant.id })
    const conflict = f.game.social.society.conflicts
    conflict?.apply(
        f.merchant,
        f.player.actor,
        'flee',
        {
            id: 'newest-threat',
            kind: 'threat',
            locationId: CENTER_LOCATION_ID,
        },
        Date.now()
    )
    f.guard.tags.delete('offline')
    vi.advanceTimersByTime(500)
    const revisions = earlier.mock.calls.flatMap(([request]) =>
        request.trigger === 'theft' ? [request.revision] : []
    )
    expect(revisions).toEqual([0])
    expect(f.merchant.position.x).toBeGreaterThan(80)
    expect(conflict?.hasPhysicalReaction(f.merchant, Date.now())).toBe(true)
})

it('considers a blocked route during flight even when the offender is no longer visible', () => {
    const f = setup()
    f.guard.tags.add('offline')
    const respond = f.merchant.temperament.react.bind(f.merchant.temperament)
    const decision = vi
        .spyOn(f.merchant.temperament, 'react')
        .mockImplementation((request, now, random) => {
            if (request.trigger !== 'theft') {
                return respond(request, now, random)
            }
            const action = request.revision === 0 ? 'flee' : 'wait'
            if (request.revision !== 0) {
                expect(request.available).toEqual(['wait'])
            }
            return {
                action,
                weights: { [action]: 100 },
                roll: 0,
                reason: request,
            }
        })
    vi.spyOn(Math, 'random').mockReturnValue(0)
    f.merchant.inventory.push(createItemInstance('food'))
    f.player.send({ type: 'movement_mode', mode: 'sneaking' })
    f.player.send({ type: 'steal', targetId: f.merchant.id })
    vi.advanceTimersByTime(200)
    expect(f.merchant.position.x).toBeGreaterThan(80)

    const navigation = f.game.navigationFor(f.merchant)
    vi.spyOn(navigation, 'hasLineOfSight').mockReturnValue(false)
    vi.spyOn(navigation, 'findPathWorld').mockReturnValue([])
    vi.advanceTimersByTime(750)
    expect(
        decision.mock.calls.flatMap(([request]) =>
            request.trigger === 'theft' ? [request.revision] : []
        )
    ).toEqual([0, 'escape_blocked'])
    expect(
        f.game.social.society.conflicts?.hasPhysicalReaction(
            f.merchant,
            Date.now()
        )
    ).toBe(false)
})

function choose(
    actor: GameCharacter,
    trigger: ReactionTrigger,
    action: ReactionAction
) {
    const react = actor.temperament.react.bind(actor.temperament)
    return vi
        .spyOn(actor.temperament, 'react')
        .mockImplementation((request, now, random) => {
            if (request.trigger !== trigger) {
                return react(request, now, random)
            }
            expect(request.available).toContain(action)
            return {
                action,
                weights: { [action]: 100 },
                roll: 0,
                reason: request,
            }
        })
}
