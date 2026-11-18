import assert from 'node:assert/strict'

import { parseMasteryExperience } from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { toggleDefensiveStance } from '../src/game/bladeStance'
import { setCharacterControlSource } from '../src/game/characterSoul'
import {
    attemptAbilityAttack,
    attemptAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { applyAttackStun } from '../src/game/combatDamage'
import { refreshCombatState } from '../src/game/combatState'
import { createItemInstance } from '../src/game/inventory'
import { advanceCharacter } from '../src/game/movement'
import { GameRoom } from '../src/game/room'
import { canPerformSkillAction } from '../src/game/skillProgression'
import { WorldLocations } from '../src/game/worldLocations'
import { bladeDuel } from './bladeCombatFixture'
import { joinScenarioRoom } from './scenarioRoomHelpers'

function damage(events: ReturnType<typeof resolvePendingAttackHit>): number {
    return events
        .filter((event) => event.kind === 'damage')
        .reduce((sum, event) => sum + (event.amount ?? 0), 0)
}

describe('one ordinary human attack deadline', () => {
    it.each(['vanguard', 'ranger', 'arcanist', 'cleric'] as const)(
        'uses the same 450/50/450 phases and 15 energy for %s before earned stars',
        (background) => {
            const f = bladeDuel(background)
            const energy = f.actor.energy
            expect(attemptAttack(f.attack)).toHaveLength(1)
            expect(f.actor.combat.action).toMatchObject({
                startedAt: 1000,
                hitAt: 1050,
                movementAt: 1450,
                readyAt: 1450,
                origin: 'basic',
            })
            expect(f.actor.combat.readyAt).toBe(1450)
            expect(f.actor.energy).toBe(energy - 15)
            expect(resolvePendingAttackHit(f.at(1049))).toEqual([])
            expect(damage(resolvePendingAttackHit(f.at(1050)))).toBe(3)
            expect(attemptAttack(f.at(1449))).toEqual([])
            expect(attemptAttack(f.at(1450))).toHaveLength(1)
        }
    )

    it('scales the full cycle and both phases to 315 ms without retaining an older attack cooldown', () => {
        const f = bladeDuel()
        for (const id of ['blade.root', 'blade.tempo', 'blade.tempo2']) {
            f.actor.progression.constellations.opened.add(id)
        }
        expect(attemptAttack(f.attack)).toHaveLength(1)
        expect(f.actor.combat.action).toMatchObject({
            hitAt: 1035,
            movementAt: 1315,
            readyAt: 1315,
        })
        expect(resolvePendingAttackHit(f.at(1034))).toEqual([])
        expect(damage(resolvePendingAttackHit(f.at(1035)))).toBeGreaterThan(0)
        expect(f.target.energy).toBe(92)
        expect(attemptAttack(f.at(1314))).toEqual([])
        expect(attemptAttack(f.at(1315))).toHaveLength(1)
    })

    it('returns movement after the hit with Fluid Stance while the action stays busy', () => {
        const f = bladeDuel()
        f.actor.progression.constellations.opened.add('blade.fluid_stance')
        attemptAttack(f.attack)
        expect(f.actor.isActionLocked(1049)).toBe(true)
        resolvePendingAttackHit(f.at(1050))
        expect(f.actor.isActionLocked(1050)).toBe(false)
        expect(f.actor.combat.readyAt).toBe(1450)
        expect(canPerformSkillAction(f.actor, 1050)).toBe(false)
        f.actor.abilities.known.add('spark')
        const mana = f.actor.mana
        expect(attemptAbilityAttack(f.at(1050), 'spark')).toEqual([])
        expect(f.actor.mana).toBe(mana)
        f.actor.setMoveInput({ x: 1, y: 0 })
        advanceCharacter({
            character: f.actor,
            navigation: f.navigation,
            now: 1066,
            deltaMs: 16,
        })
        expect(f.actor.position.x).toBeGreaterThan(100)
        expect(f.actor.combat.readyAt).toBe(1450)
    })

    it('keeps the exhausted strike at twice the time and a third of damage without stun or combo', () => {
        const f = bladeDuel()
        f.actor.progression.constellations.opened.add('blade.combo3')
        f.actor.energy = 14
        expect(attemptAttack(f.attack)).toHaveLength(1)
        expect(f.actor.combat.action).toMatchObject({
            hitAt: 1100,
            movementAt: 1900,
            readyAt: 1900,
        })
        expect(f.actor.pendingAttack).toMatchObject({
            underpowered: true,
            canStun: false,
        })
        expect(f.actor.energy).toBe(0)
        expect(damage(resolvePendingAttackHit(f.at(1100)))).toBe(1)
        expect(f.actor.combat.combo).toBeUndefined()
        expect(f.target.stunUntil).toBe(0)
    })
})

it('retains the locked fraction of a movement tick that crosses the final recovery deadline', () => {
    const f = bladeDuel()
    attemptAttack(f.attack)
    resolvePendingAttackHit(f.at(1050))
    f.actor.setMoveInput({ x: 1, y: 0 })
    advanceCharacter({
        character: f.actor,
        navigation: f.navigation,
        now: 1500,
        deltaMs: 100,
    })
    // The interval 1400–1450 is still locked; only its final 50 ms can move.
    expect(f.actor.position.x).toBeCloseTo(
        100 + f.actor.config.moveSpeed * 0.05
    )
    expect(f.actor.combat.readyAt).toBe(1450)
})

describe('weapon and identity lifecycle', () => {
    it.each(['network_player', 'scripted', 'mob1'] as const)(
        'gives the shared knife a useful paid hit and practice for %s control',
        (controller) => {
            const f = bladeDuel('cleric', controller)
            expect(f.actor.equipment.weapon).toBeUndefined()
            const bag = [...f.actor.inventory]
            expect(attemptAttack(f.attack)).toHaveLength(1)
            expect(damage(resolvePendingAttackHit(f.at(1050)))).toBe(3)
            expect(f.actor.progression.masteries.blade.experience).toBe(
                parseMasteryExperience('15')
            )
            expect(f.actor.inventory).toEqual(bag)
            expect(f.actor.equipment.weapon).toBeUndefined()
        }
    )

    it('lets an already paid strike resolve after a real room disconnect into Echo', () => {
        vi.stubGlobal('Bun', { env: {} })
        const f = bladeDuel()
        const room = new GameRoom(f.navigation)
        try {
            const session = joinScenarioRoom(room, 'Оплаченный удар', 'cleric')
            const actor = session.actor
            actor.position = { x: 100, y: 100 }
            actor.progression.constellations.opened.clear()
            actor.config.combat.critChance = 0
            const attack = { ...f.attack, actor, targets: [actor, f.target] }
            expect(attemptAttack(attack)).toHaveLength(1)
            room.handleClose(session.socket)
            expect(actor.connected).toBe(false)
            expect(actor.soul.kind).toBe('echo')
            expect(actor.tags.has('offline')).toBe(false)
            expect(
                damage(resolvePendingAttackHit({ ...attack, now: 1050 }))
            ).toBe(3)
            expect(actor.combat.readyAt).toBe(1450)
        } finally {
            room.stop()
            vi.unstubAllGlobals()
        }
    })

    it('keeps a separately unavailable offline identity out of attack resolution', () => {
        const f = bladeDuel()
        attemptAttack(f.attack)
        f.actor.tags.add('offline')
        expect(resolvePendingAttackHit(f.at(1050))).toEqual([])
        expect(f.actor.combat.readyAt).toBe(1450)
    })

    it('blocks broken equipped weapons and cancels a changed instance without refunding readiness', () => {
        const f = bladeDuel()
        const sword = createItemInstance('old_sword')
        sword.durability = 0
        f.actor.equipment.weapon = sword
        const energy = f.actor.energy
        expect(attemptAttack(f.attack)).toEqual([])
        expect(f.actor.energy).toBe(energy)
        delete f.actor.equipment.weapon
        expect(attemptAttack(f.attack)).toHaveLength(1)
        const paid = f.actor.energy
        f.actor.equipment.weapon = createItemInstance('old_sword')
        expect(resolvePendingAttackHit(f.at(1050))).toEqual([])
        expect(f.actor.combat.readyAt).toBe(1450)
        expect(f.actor.energy).toBe(paid)
        expect(attemptAttack(f.at(1449))).toEqual([])
        expect(attemptAttack(f.at(1450))).toHaveLength(1)
    })

    it('retains recovery after pending cancellation and a real shared location transition', () => {
        const f = bladeDuel()
        f.actor.position.x = 8
        f.target.position.x = 8
        f.actor.progression.constellations.opened.add('blade.fluid_stance')
        expect(attemptAttack(f.attack)).toHaveLength(1)
        f.actor.clearPendingAttackHit()
        expect(f.actor.combat.readyAt).toBe(1450)
        const world = new WorldLocations(f.navigation)
        expect(world.travel(f.actor, { x: -1, y: 0 }, 1100)).toContain(
            'Локация:'
        )
        expect(f.actor.locationId).toBe('map-1-2')
        expect(f.actor.pendingAttack).toBeUndefined()
        expect(f.actor.combat.action).toBeUndefined()
        expect(f.actor.combat.readyAt).toBe(1450)
    })
})

describe('held defense and short stun lifecycle', () => {
    it('blocks motion, attacks and energy regeneration while held and leaves on controller change', () => {
        const f = bladeDuel()
        f.actor.progression.constellations.opened.add('blade.defensive_stance')
        f.actor.abilities.known.add('defensive_stance')
        f.actor.energy = 50
        expect(toggleDefensiveStance(f.actor, 1000)).toHaveLength(1)
        expect(f.actor.combat.defensiveStance).toBe(true)
        f.actor.setMoveInput({ x: 1, y: 0 })
        advanceCharacter({
            character: f.actor,
            navigation: f.navigation,
            now: 1100,
            deltaMs: 1000,
        })
        expect(f.actor.position).toEqual({ x: 100, y: 100 })
        expect(f.actor.energy).toBe(50)
        expect(attemptAttack(f.at(1100))).toEqual([])
        expect(canPerformSkillAction(f.actor, 1100)).toBe(false)
        setCharacterControlSource(f.actor, 'script')
        refreshCombatState(f.actor, 1200)
        expect(f.actor.combat.defensiveStance).toBe(false)
        expect(f.actor.combat.stanceAvailableAt).toBe(2200)
        expect(toggleDefensiveStance(f.actor, 2199)).toEqual([])
        expect(toggleDefensiveStance(f.actor, 2200)).toHaveLength(1)
    })

    it('starts an exit cooldown when defense is explicitly released', () => {
        const f = bladeDuel()
        f.actor.progression.constellations.opened.add('blade.defensive_stance')
        toggleDefensiveStance(f.actor, 1000)
        expect(toggleDefensiveStance(f.actor, 1100)).toHaveLength(1)
        expect(f.actor.combat.defensiveStance).toBe(false)
        expect(f.actor.combat.stanceAvailableAt).toBe(2100)
        expect(toggleDefensiveStance(f.actor, 2099)).toEqual([])
        expect(toggleDefensiveStance(f.actor, 2100)).toHaveLength(1)
    })

    it('does not extend a present stun and enforces two seconds of immunity after it ends', () => {
        const f = bladeDuel()
        const hit = {
            hitAt: 1000,
            canStun: true,
            damageMultiplier: 1,
            targetEnergyDrain: 8,
        }
        expect(
            applyAttackStun(f.actor, f.target, hit, 1000, () => 0)
        ).toHaveLength(1)
        expect(f.target.stunUntil).toBe(1500)
        expect(f.target.combat.stunImmuneUntil).toBe(3500)
        expect(applyAttackStun(f.actor, f.target, hit, 1100, () => 0)).toEqual(
            []
        )
        expect(f.target.stunUntil).toBe(1500)
        expect(applyAttackStun(f.actor, f.target, hit, 3499, () => 0)).toEqual(
            []
        )
        expect(
            applyAttackStun(f.actor, f.target, hit, 3500, () => 0)
        ).toHaveLength(1)
        expect(f.target.stunUntil).toBe(4000)
    })

    it('permits a fully paid basic stun with only its exact energy cost remaining', () => {
        const f = bladeDuel()
        f.actor.energy = 15
        const samples = [0.99, 0.5, 0.99, 0, 0]
        expect(attemptAttack(f.attack)).toHaveLength(1)
        expect(f.actor.energy).toBe(0)
        const events = resolvePendingAttackHit({
            ...f.at(1050),
            random: () => samples.shift() ?? 0,
        })
        expect(damage(events)).toBeGreaterThan(0)
        expect(events).toContainEqual(
            expect.objectContaining({
                kind: 'status',
                statusId: 'stun',
                targetId: f.target.id,
            })
        )
        expect(f.target.stunUntil).toBe(1550)
    })

    it('clears death transients without turning a cancelled attack into a free new attack', () => {
        const f = bladeDuel()
        attemptAttack(f.attack)
        assert(f.actor.combat.action !== undefined)
        f.actor.applyDamage(f.actor.hp, 1020)
        expect(f.actor.pendingAttack).toBeUndefined()
        expect(f.actor.combat.action).toBeUndefined()
        expect(f.actor.combat.combo).toBeUndefined()
        expect(f.actor.combat.defensiveStance).toBe(false)
        expect(f.actor.combat.readyAt).toBe(1450)
    })
})
