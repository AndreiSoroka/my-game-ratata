import assert from 'node:assert/strict'

import { parseMasteryExperience } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { toggleDefensiveStance } from '../src/game/bladeStance'
import { GameCharacter } from '../src/game/character'
import type { WorldChest } from '../src/game/chestInteraction'
import {
    type AttackContext,
    attemptAbilityAttack,
    attemptAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { createItemInstance } from '../src/game/inventory'
import { WorldDeathLoot } from '../src/game/worldDeathLoot'
import { bladeDuel } from './bladeCombatFixture'

function armed() {
    const fixture = bladeDuel()
    fixture.actor.equipment.weapon = createItemInstance('simple_sword')
    fixture.actor.abilities.known.add('wide_swing')
    fixture.actor.abilities.known.add('circular_swing')
    return fixture
}

function enemy(id: string, x: number, y: number): GameCharacter {
    const actor = new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        heroClass: 'cleric',
        controllerKind: 'mob1',
        faction: 'monsters',
        spawnPosition: { x, y },
    })
    actor.baseMaxHp = actor.hp = 1000
    actor.progression.constellations.opened.clear()
    actor.config.combat.critChance = actor.config.combat.dodgeChance = 0
    return actor
}

function parriesAndCounters(actor: GameCharacter): void {
    actor.progression.constellations.opened.add('blade.dodge')
    actor.progression.constellations.opened.add('blade.counterattack')
}

function contact(context: AttackContext) {
    const hitAt = context.actor.pendingAttack?.hitAt
    assert(hitAt !== undefined)
    return resolvePendingAttackHit({ ...context, now: hitAt })
}

describe('one authoritative area packet and per-identity death receipts', () => {
    it('kills each target once and transfers finite possessions once even when death events repeat', () => {
        const f = armed()
        const other = enemy('second-victim', 106, 114)
        f.target.hp = other.hp = 1
        const apple = createItemInstance('food')
        const boots = createItemInstance('boots')
        f.target.inventory = [apple]
        other.equipment.boots = boots
        const sword = f.actor.equipment.weapon
        assert(sword !== undefined)
        const durability = sword.durability
        const context = {
            ...f.attack,
            targetId: undefined,
            targets: [f.actor, f.target, other, other],
        }
        expect(attemptAbilityAttack(context, 'wide_swing')).toHaveLength(1)
        const events = contact(context)
        const deaths = events.filter((event) => event.kind === 'death')
        expect(deaths.map((event) => event.targetId).sort()).toEqual(
            [f.target.id, other.id].sort()
        )
        expect(f.target.deathSequence).toBe(1)
        expect(other.deathSequence).toBe(1)
        expect(f.actor.energy).toBe(77)
        expect(sword.durability).toBe((durability ?? 0) - 1)
        expect(f.actor.progression.masteries.blade.experience).toBe(
            parseMasteryExperience('15')
        )
        const containers = new Map<string, WorldChest>()
        const loot = new WorldDeathLoot(f.actor.locationId, containers)
        const find = (id: string) =>
            context.targets.find((actor) => actor.id === id)
        expect(loot.resolve(events, find)).toHaveLength(2)
        expect(containers.size).toBe(2)
        const firstCorpse = containers.get(`corpse:${f.target.id}:1`)
        const secondCorpse = containers.get(`corpse:${other.id}:1`)
        expect(firstCorpse?.contents).toEqual([apple])
        expect(secondCorpse?.contents).toEqual([boots])
        expect(secondCorpse?.contents[0]?.durability).toBe(999)
        expect(f.target.inventory).toEqual([])
        expect(other.equipment).toEqual({})
        assert(firstCorpse !== undefined && secondCorpse !== undefined)
        firstCorpse.contents = []
        secondCorpse.contents = []
        expect(loot.resolve([...events, ...deaths], find)).toEqual([])
        expect(
            [...containers.values()].flatMap((chest) => chest.contents)
        ).toEqual([])
        expect(resolvePendingAttackHit({ ...context, now: 1500 })).toEqual([])
        expect(f.target.deathSequence).toBe(1)
        expect(other.deathSequence).toBe(1)
    })

    it('finishes all area contacts before a lethal counter and revalidates the next counter', () => {
        const f = armed()
        const second = enemy('second-parry', 104, 112)
        const victim = enemy('last-contact', 100, 116)
        parriesAndCounters(f.target)
        parriesAndCounters(second)
        f.actor.hp = 1
        expect(
            attemptAttack({
                ...f.attack,
                actor: f.target,
                targetId: f.actor.id,
                now: 900,
            })
        ).toHaveLength(1)
        const pending = f.target.pendingAttack
        const readyAt = f.target.combat.readyAt
        const firstEnergy = f.target.energy
        const context = {
            ...f.attack,
            targetId: undefined,
            targets: [f.actor, f.target, second, victim],
            random: () => 0.05,
        }
        expect(attemptAbilityAttack(context, 'wide_swing')).toHaveLength(1)
        const events = contact(context)
        expect(events.filter((event) => event.kind === 'parry')).toHaveLength(2)
        const finalAreaHit = events.findIndex(
            (event) => event.kind === 'damage' && event.targetId === victim.id
        )
        const firstCounter = events.findIndex(
            (event) => event.attackOrigin === 'counter'
        )
        expect(finalAreaHit).toBeGreaterThanOrEqual(0)
        expect(firstCounter).toBeGreaterThan(finalAreaHit)
        expect(victim.hp).toBeLessThan(1000)
        expect(f.actor.alive).toBe(false)
        expect(events.filter((event) => event.kind === 'death')).toHaveLength(1)
        expect(
            events.filter(
                (event) =>
                    event.kind === 'attack' && event.attackOrigin === 'counter'
            )
        ).toHaveLength(1)
        expect(f.target.energy).toBe(firstEnergy - 5 - 15)
        expect(second.energy).toBe(95)
        expect(f.target.pendingAttack).toBe(pending)
        expect(f.target.combat.readyAt).toBe(readyAt)
    })
})

describe('area defenses and final damage', () => {
    it('runs multiple parry responses after the circle without allowing a counter chain', () => {
        const f = armed()
        const second = enemy('second-response', 104, 112)
        const victim = enemy('circle-behind', 100, 88)
        for (const actor of [f.actor, f.target, second]) {
            parriesAndCounters(actor)
        }
        const context = {
            ...f.attack,
            targetId: undefined,
            targets: [f.actor, f.target, second, victim],
            random: () => 0.05,
        }
        expect(attemptAbilityAttack(context, 'circular_swing')).toHaveLength(1)
        const events = contact(context)
        const counters = events.filter(
            (event) =>
                event.kind === 'attack' && event.attackOrigin === 'counter'
        )
        expect(counters.map((event) => event.actorId)).toEqual([
            f.target.id,
            second.id,
        ])
        const primaryHit = events.findIndex(
            (event) => event.kind === 'damage' && event.targetId === victim.id
        )
        expect(primaryHit).toBeGreaterThanOrEqual(0)
        for (const counter of counters) {
            expect(events.indexOf(counter)).toBeGreaterThan(primaryHit)
        }
        expect(
            events.filter(
                (event) =>
                    event.kind === 'parry' && event.attackOrigin === 'counter'
            )
        ).toHaveLength(2)
        expect(f.target.energy).toBe(80)
        expect(second.energy).toBe(80)
        expect(f.actor.energy).toBe(52)
        expect(f.actor.hp).toBe(f.actor.maxHp)
        expect(f.actor.combat.readyAt).toBe(1900)
        expect(f.actor.progression.masteries.blade.experience).toBe(
            parseMasteryExperience('15')
        )
    })

    it('rounds a critical area contact once after Blade, ability and guard multipliers', () => {
        const f = armed()
        for (const id of ['blade.root', 'blade.damage1', 'blade.damage2']) {
            f.actor.progression.constellations.opened.add(id)
        }
        f.actor.config.combat.critChance = 1
        f.target.progression.constellations.opened.add('blade.defensive_stance')
        f.target.progression.constellations.opened.add('blade.guard_strong')
        expect(toggleDefensiveStance(f.target, 900)).toHaveLength(1)
        expect(attemptAbilityAttack(f.attack, 'wide_swing')).toHaveLength(1)
        const events = contact(f.attack)
        const damage = events.find((event) => event.kind === 'damage')
        // The weapon roll is 9: rounding 9 × 1.6 × 1.35 × .75 first would wrongly produce 5.
        expect(damage).toMatchObject({ amount: 4, critical: true })
        expect(damage?.amount).toBe(Math.round(9 * 1.6 * 1.35 * 0.75 * 0.3))
        expect(f.target.energy).toBe(93)
        expect(f.actor.energy).toBe(77)
    })
})
