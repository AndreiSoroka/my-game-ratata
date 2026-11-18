import assert from 'node:assert/strict'

import { parseMasteryExperience } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { GameCharacter } from '../src/game/character'
import {
    type AttackContext,
    attemptAbilityAttack,
    attemptAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { isInAttackGeometry } from '../src/game/combatGeometry'
import { observeCharacterCombat } from '../src/game/combatObservation'
import { refreshCombatState } from '../src/game/combatState'
import { createItemInstance } from '../src/game/inventory'
import { advanceCharacter } from '../src/game/movement'
import { bladeDuel } from './bladeCombatFixture'

beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => vi.unstubAllGlobals())

function armed() {
    const f = bladeDuel()
    f.actor.equipment.weapon = createItemInstance('simple_sword')
    return f
}
function enemy(id: string, x: number, y: number): GameCharacter {
    const value = new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        heroClass: 'cleric',
        controllerKind: 'mob1',
        faction: 'monsters',
        spawnPosition: { x, y },
    })
    value.baseMaxHp = value.hp = 1000
    value.progression.constellations.opened.clear()
    value.config.combat.dodgeChance = value.config.combat.critChance = 0
    return value
}
function hitDamage(
    events: ReturnType<typeof resolvePendingAttackHit>,
    targetId?: string
): number {
    return events
        .filter(
            (event) =>
                event.kind === 'damage' &&
                (targetId === undefined || event.targetId === targetId)
        )
        .reduce((sum, event) => sum + (event.amount ?? 0), 0)
}
function contact(context: AttackContext) {
    const due = context.actor.pendingAttack?.hitAt
    assert(due !== undefined)
    return resolvePendingAttackHit({ ...context, now: due })
}
function strike(f: ReturnType<typeof armed>, now: number): number {
    f.actor.energy = 100
    expect(attemptAttack({ ...f.attack, now })).toHaveLength(1)
    return hitDamage(contact({ ...f.attack, now }))
}

describe('exact shared blade technique geometry and one action payment', () => {
    it('resolves all legal sector contacts once, excludes its back and wall, and rewards/wears once', () => {
        const f = armed()
        f.actor.abilities.known.add('wide_swing')
        const side = enemy('side', 109, 108),
            back = enemy('back', 100, 88),
            wall = enemy('wall', 92, 114)
        const hasLine = f.navigation.hasLineOfSight.bind(f.navigation)
        vi.spyOn(f.navigation, 'hasLineOfSight').mockImplementation(
            (from, to) => to.x !== wall.position.x && hasLine(from, to)
        )
        const context = {
            ...f.attack,
            targetId: undefined,
            targets: [f.actor, f.target, side, side, back, wall],
        }
        const sword = f.actor.equipment.weapon
        assert(sword !== undefined)
        const durability = sword.durability
        expect(attemptAbilityAttack(context, 'wide_swing')).toHaveLength(1)
        expect(f.actor.energy).toBe(77)
        expect(f.actor.combat.readyAt).toBe(1650)
        expect(f.actor.abilities.availableAt.wide_swing).toBe(5000)
        const events = contact(context)
        expect(
            events
                .filter((event) => event.kind === 'damage')
                .map((event) => event.targetId)
                .sort()
        ).toEqual([f.target.id, side.id].sort())
        expect(sword.durability).toBe((durability ?? 0) - 1)
        expect(f.actor.progression.masteries.blade.experience).toBe(
            parseMasteryExperience('15')
        )
        expect(f.actor.energy).toBe(77)
        expect(f.actor.combat.combo).toBeUndefined()
        expect(f.target.stunUntil).toBe(0)
        expect(side.stunUntil).toBe(0)
    })

    it('uses a real circle, including targets behind, with a separate hit per target and one weapon wear', () => {
        const f = armed()
        f.actor.abilities.known.add('circular_swing')
        const back = enemy('behind', 100, 80),
            corner = enemy('outside-circle', 125, 125)
        const context = {
            ...f.attack,
            targetId: undefined,
            targets: [f.actor, f.target, back, corner],
        }
        expect(attemptAbilityAttack(context, 'circular_swing')).toHaveLength(1)
        expect(f.actor.energy).toBe(62)
        const events = contact(context)
        expect(
            events
                .filter((event) => event.kind === 'damage')
                .map((event) => event.targetId)
                .sort()
        ).toEqual([back.id, f.target.id].sort())
        expect(corner.hp).toBe(1000)
        expect(f.actor.combat.readyAt).toBe(1900)
        expect(f.actor.abilities.availableAt.circular_swing).toBe(9000)
    })

    it('tests the exact inclusive angular and radial boundaries', () => {
        const sector = {
            kind: 'sector' as const,
            center: { x: 0, y: 0 },
            direction: { x: 0, y: 1 },
            angleDegrees: 120,
            radius: 20,
        }
        expect(
            isInAttackGeometry({ x: Math.sqrt(3) * 10, y: 10 }, sector)
        ).toBe(true)
        expect(
            isInAttackGeometry({ x: Math.sqrt(3) * 10 + 0.001, y: 10 }, sector)
        ).toBe(false)
        expect(isInAttackGeometry({ x: 0, y: -1 }, sector)).toBe(false)
        expect(
            isInAttackGeometry(
                { x: 20, y: 0 },
                { kind: 'circle', center: { x: 0, y: 0 }, radius: 20 }
            )
        ).toBe(true)
        expect(
            isInAttackGeometry(
                { x: 20, y: 0.01 },
                { kind: 'circle', center: { x: 0, y: 0 }, radius: 20 }
            )
        ).toBe(false)
    })
})

describe('shared technique movement', () => {
    it('keeps the circular-axis movement slow only during its explicit post-hit phase', () => {
        const f = armed()
        f.actor.abilities.known.add('circular_swing')
        f.actor.progression.constellations.opened.add('blade.circle_axis')
        expect(
            attemptAbilityAttack(
                { ...f.attack, targetId: undefined },
                'circular_swing'
            )
        ).toHaveLength(1)
        contact(f.attack)
        f.actor.setMoveInput({ x: 1, y: 0 })
        advanceCharacter({
            character: f.actor,
            navigation: f.navigation,
            now: 1600,
            deltaMs: 100,
        })
        expect(f.actor.position.x).toBeCloseTo(102.25)
        advanceCharacter({
            character: f.actor,
            navigation: f.navigation,
            now: 1850,
            deltaMs: 50,
        })
        expect(f.actor.position.x).toBeCloseTo(106.75)
        expect(f.actor.combat.readyAt).toBe(1900)
    })

    it('advances a lunge with ordinary collisions, rechecks its hit, and retains paid cooldown on a wall miss', () => {
        const f = armed()
        f.actor.abilities.known.add('lunge')
        f.target.position.y = 140
        f.navigation.grid.solid[7 * 32 + 6] = true
        const before = { ...f.actor.position }
        expect(
            attemptAbilityAttack({ ...f.attack, targetId: undefined }, 'lunge')
        ).toHaveLength(1)
        for (const now of [1060, 1120, 1180]) {
            advanceCharacter({
                character: f.actor,
                navigation: f.navigation,
                now,
                deltaMs: 60,
            })
        }
        expect(f.actor.position.y).toBeLessThan(112)
        expect(f.actor.position.x).toBe(before.x)
        expect(contact(f.attack).some((event) => event.kind === 'miss')).toBe(
            true
        )
        expect(f.target.hp).toBe(1000)
        expect(f.actor.energy).toBeLessThan(100)
        expect(f.actor.abilities.availableAt.lunge).toBe(6000)
        expect(f.actor.combat.readyAt).toBe(1600)
    })

    it('lands a long lunge from its actual arrived position rather than its initial footprint', () => {
        const f = armed()
        f.actor.abilities.known.add('lunge')
        f.actor.progression.constellations.opened.add('blade.long_lunge')
        f.target.position.y = 140
        expect(attemptAbilityAttack(f.attack, 'lunge')).toHaveLength(1)
        for (const now of [1060, 1120, 1180]) {
            advanceCharacter({
                character: f.actor,
                navigation: f.navigation,
                now,
                deltaMs: 60,
            })
        }
        expect(f.actor.position.y).toBeGreaterThan(130)
        expect(hitDamage(contact(f.attack))).toBe(9)
        const geometry = f.actor.combat.action?.geometry
        expect(geometry?.kind).toBe('rectangles')
        if (geometry?.kind === 'rectangles') {
            expect(geometry.zones[0]?.minY).toBeCloseTo(f.actor.position.y)
        }
    })
})

describe('combination uses the original weapon basis and actual successful contacts', () => {
    it.each([
        { id: 'blade.combo1', limit: 3, last: 15 },
        { id: 'blade.combo2', limit: 5, last: 17 },
        { id: 'blade.combo3', limit: 10, last: 21 },
    ])('caps $id at $limit additive steps', ({ id, limit, last }) => {
        const f = armed()
        for (const star of [
            'blade.root',
            'blade.damage1',
            'blade.damage2',
            id,
        ]) {
            f.actor.progression.constellations.opened.add(star)
        }
        const damage = Array.from({ length: limit + 2 }, (_, index) =>
            strike(f, 1000 + index * 500)
        )
        expect(damage.slice(0, 3)).toEqual([12, 13, 14])
        expect(damage.at(-1)).toBe(last)
        expect(f.actor.combat.combo?.stacks).toBe(limit)
    })

    it('adds an original-weapon combo step after the pommel damage factor rather than scaling it down again', () => {
        const f = armed()
        for (const star of ['blade.root', 'blade.combo1']) {
            f.actor.progression.constellations.opened.add(star)
        }
        expect(strike(f, 1000)).toBe(10)
        expect(strike(f, 1500)).toBe(11)
        f.actor.abilities.known.add('pommel_strike')
        expect(
            attemptAbilityAttack({ ...f.attack, now: 2000 }, 'pommel_strike')
        ).toHaveLength(1)
        expect(hitDamage(contact({ ...f.attack, now: 2000 }))).toBe(4)
        expect(f.actor.combat.combo?.stacks).toBe(3)
        expect(f.target.stunUntil).toBe(2600)
    })

    it('preserves the series on a missed swing until the exact three-second expiry', () => {
        const f = armed()
        f.actor.progression.constellations.opened.add('blade.combo1')
        strike(f, 1000)
        const until = f.actor.combat.combo?.expiresAt
        assert(until !== undefined)
        const context = {
            ...f.attack,
            now: 1500,
            targetId: undefined,
            targets: [f.actor],
        }
        attemptAttack(context)
        expect(contact(context).some((event) => event.kind === 'miss')).toBe(
            true
        )
        refreshCombatState(f.actor, until - 1)
        expect(f.actor.combat.combo?.stacks).toBe(1)
        refreshCombatState(f.actor, until)
        expect(f.actor.combat.combo).toBeUndefined()
    })

    it('resets on a different ranged target and keeps fully absorbed contacts meaningful without HP loss', () => {
        const f = armed()
        f.actor.progression.constellations.opened.add('blade.combo1')
        strike(f, 1000)
        f.target.abilities.barrier = {
            remaining: 100,
            expiresAt: 10000,
            practiced: false,
        }
        strike(f, 1500)
        expect(f.actor.combat.combo?.stacks).toBe(2)
        const old = f.actor.combat.combo
        f.actor.abilities.barrier = {
            remaining: 100,
            expiresAt: 10000,
            practiced: false,
        }
        resolveCharacterDamage({
            actor: f.target,
            target: f.actor,
            amount: 5,
            now: 1600,
            damageKind: 'physical',
            respawnDelayMs: 10000,
        })
        expect(f.actor.combat.combo).toBe(old)
        const other = enemy('ranged-target', 100, 124)
        f.actor.abilities.known.add('shot')
        const ranged = {
            ...f.attack,
            now: 2000,
            targets: [f.actor, f.target, other],
            targetId: other.id,
        }
        expect(attemptAbilityAttack(ranged, 'shot')).toHaveLength(1)
        expect(f.actor.combat.combo).toBeUndefined()
    })
})

describe('private combo projection', () => {
    it('never sends a foreign combination count or upgrades private Life resource knowledge', () => {
        const f = armed()
        f.actor.progression.constellations.opened.add('blade.combo1')
        f.actor.progression.constellations.opened.add('blade.insight3')
        strike(f, 1000)
        const raw = f.actor.snapshot(1100)
        expect(raw.combat?.combo?.stacks).toBe(1)
        const own = observeCharacterCombat(raw, f.actor, {
            observer: f.actor,
            getCharacter: () => f.actor,
            navigation: f.navigation,
            now: 1100,
        })
        expect(own.combat?.combo?.stacks).toBe(1)
        expect(own.health.kind).toBe('percent')
        expect(own.resources.energy.kind).toBe('percent')
        expect(own.characterSheet?.attacks[0]?.damage.min.kind).toBe('exact')
        const foreign = observeCharacterCombat(raw, f.actor, {
            observer: f.target,
            getCharacter: () => f.actor,
            navigation: f.navigation,
            now: 1100,
        })
        expect(foreign.combat?.combo).toBeUndefined()
        expect(foreign.characterSheet).toBeUndefined()
    })
})
