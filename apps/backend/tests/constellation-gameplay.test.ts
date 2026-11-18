import { describe, expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { restoreCharacter } from '../src/game/characterRecovery'
import {
    attemptAbilityAttack,
    attemptAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { buildAbilityAttackZones, isInZones } from '../src/game/combatGeometry'
import { constellationModifiers } from '../src/game/constellationModifiers'
import {
    effectiveAbility,
    effectiveAttackEnergyCost,
    effectiveCharacterStats,
    effectiveDashCost,
    effectiveMoveSpeed,
    effectiveTheftCost,
} from '../src/game/effectiveParameters'
import { createItemInstance } from '../src/game/inventory'
import { advanceCharacter } from '../src/game/movement'
import { handleMovementCommand } from '../src/game/movementActions'
import { recordVitalityRecovery } from '../src/game/vitalityPractice'
import { abilityContext, abilityHero } from './abilityTestHelpers'

describe('effective shared constellation parameters', () => {
    it('applies arrow range to hit geometry using the authored tile width, and discounts real costs', () => {
        const actor = abilityHero('ranger')
        const target = abilityHero('vanguard')
        actor.progression.constellations.opened.add('arrow.range1')
        actor.progression.constellations.opened.add('arrow.range2')
        actor.progression.constellations.opened.add('arrow.economy')
        actor.progression.constellations.opened.add('arrow.tempo')
        actor.facing = 'down'
        target.position = { x: actor.position.x, y: actor.position.y + 100 }
        expect(effectiveAbility(actor, 'shot', 24).range).toBe(112)
        expect(
            isInZones(target, buildAbilityAttackZones(actor, 'shot', 24))
        ).toBe(true)
        expect(
            isInZones(target, buildAbilityAttackZones(actor, 'shot', 16))
        ).toBe(false)
        const energy = actor.energy
        const context = {
            actor,
            now: 1000,
            targets: [],
            tileSize: 24,
            respawnDelayMsFor: () => 15000,
        }
        expect(attemptAbilityAttack(context, 'shot')).toHaveLength(1)
        expect(actor.energy).toBe(energy - 9)
        expect(actor.abilities.availableAt.shot).toBe(1495)
    })

    it('makes bonuses change actual sword damage and costs only after the discovering hit', () => {
        const actor = abilityHero('vanguard')
        const target = abilityHero('vanguard', 'undead')
        Object.assign(target, {
            faction: 'monsters',
            hp: 1000,
            maxHp: 1000,
            position: { x: 100, y: 112 },
        })
        actor.equipment.weapon = createItemInstance('simple_sword')
        actor.progression.masteries.blade.experience = 85_000_000n
        const context = {
            actor,
            targetId: target.id,
            targets: [target],
            now: 1000,
            tileSize: 16,
            respawnDelayMsFor: () => 15000,
            random: () => 0.3,
        }
        attemptAttack(context)
        const first = resolvePendingAttackHit({ ...context, now: 1050 }).find(
            (event) => event.kind === 'damage'
        )?.amount
        expect(
            actor.progression.constellations.opened.has('blade.damage1')
        ).toBe(true)
        attemptAttack({ ...context, now: 2000 })
        const second = resolvePendingAttackHit({ ...context, now: 2050 }).find(
            (event) => event.kind === 'damage'
        )?.amount
        expect(second).toBeGreaterThan(first ?? 0)
        actor.progression.constellations.opened.add('blade.economy')
        const before = actor.energy
        actor.spendAttackResources()
        expect(actor.energy).toBeCloseTo(
            Math.max(0, before - effectiveAttackEnergyCost(actor))
        )
        const dodgeChance = effectiveCharacterStats(actor).dodgeChance
        actor.progression.constellations.opened.add('blade.dodge')
        expect(effectiveCharacterStats(actor).dodgeChance).toBe(dodgeChance)
        expect(constellationModifiers(actor).bladeParryChance).toBe(0.1)
    })

    it('uses real barrier capacity and duration, and spell power includes mastery once', () => {
        const actor = abilityHero('arcanist')
        for (const id of [
            'magic.barrier_strength',
            'magic.barrier_duration',
            'magic.fire_damage',
        ]) {
            actor.progression.constellations.opened.add(id)
        }
        const context = abilityContext([actor], 1000)
        handleAbilityCommand(
            actor,
            { type: 'use_ability', abilityId: 'barrier' },
            context
        )
        expect(actor.abilities.barrier).toMatchObject({
            remaining: 10,
            expiresAt: 7000,
        })
        actor.progression.masteries.magic.level = 100
        expect(effectiveAbility(actor, 'fireball').damage).toBeCloseTo(8.8)
    })

    it('changes collision-resolved movement and actual dash cost for every controller', () => {
        const actor = abilityHero('vanguard')
        const navigation = abilityContext([actor], 1000).navigation
        actor.progression.constellations.opened.add('life.move')
        actor.progression.constellations.opened.add('life.dash')
        actor.progression.constellations.opened.add('shadow.economy')
        expect(effectiveMoveSpeed(actor)).toBe(94.5)
        expect(effectiveDashCost(actor)).toBe(27)
        expect(effectiveTheftCost(actor)).toBe(9)
        actor.setMoveInput({ x: 1, y: 0 })
        advanceCharacter({
            character: actor,
            deltaMs: 100,
            now: 1000,
            navigation,
        })
        expect(actor.position.x).toBeCloseTo(109.45)
        const energy = actor.energy
        handleMovementCommand(actor, { type: 'dash' }, 1100)
        expect(actor.energy).toBeCloseTo(energy - 27)
    })
})

describe('life experience provenance', () => {
    it('counts each 20% of hostile loss and recovery, with a low-health crossing once per recovery cycle', () => {
        const actor = abilityHero('vanguard')
        const enemy = abilityHero('vanguard', 'undead')
        Object.assign(enemy, { faction: 'monsters' })
        const strike = (amount: number) =>
            resolveCharacterDamage({
                actor: enemy,
                target: actor,
                amount,
                now: 1000,
                damageKind: 'physical',
                respawnDelayMs: 15000,
            })
        const block = actor.maxHp * 0.2
        strike(block)
        expect(actor.progression.masteries.life.experience).toBe(20_000_000n)
        actor.hp += block / 2
        recordVitalityRecovery(actor, block / 2, 2000)
        expect(actor.progression.masteries.life.experience).toBe(20_000_000n)
        actor.hp += block / 2
        recordVitalityRecovery(actor, block / 2, 3000)
        expect(actor.progression.masteries.life.experience).toBe(40_000_000n)
        strike(actor.maxHp - 5)
        expect(actor.progression.masteries.life.experience).toBe(20_000_000n)
        strike(1)
        expect(actor.progression.masteries.life.experience).toBe(20_000_000n)
    })

    it('does not mistake a friendly low-health crossing for an enemy-inflicted one', () => {
        const actor = abilityHero('vanguard')
        const enemy = abilityHero('vanguard', 'undead')
        const friend = abilityHero('vanguard')
        Object.assign(enemy, { faction: 'monsters' })
        const damage = (source: typeof actor, amount: number) =>
            resolveCharacterDamage({
                actor: source,
                target: actor,
                amount,
                now: 1000,
                damageKind: 'physical',
                respawnDelayMs: 15000,
            })
        damage(enemy, 1)
        damage(friend, actor.maxHp - 6)
        damage(enemy, 1)
        expect(actor.hp).toBe(4)
        expect(actor.progression.constellations.lowHpFromHostile).toBe(false)
        expect(actor.progression.constellations.lowHpAwarded).toBe(false)
        expect(actor.progression.masteries.life.experience).toBe(0n)
    })

    it('never practices from friendly damage, its recovery, or idle low health', () => {
        const actor = abilityHero('vanguard')
        const friend = abilityHero('vanguard')
        resolveCharacterDamage({
            actor: friend,
            target: actor,
            amount: 25,
            now: 1000,
            damageKind: 'physical',
            respawnDelayMs: 15000,
        })
        expect(actor.progression.masteries.life.experience).toBe(0n)
        actor.hp += 20
        expect(recordVitalityRecovery(actor, 20, 2000)).toEqual([])
        expect(actor.progression.masteries.life.experience).toBe(0n)
        expect(actor.progression.constellations.opened.has('life.root')).toBe(
            false
        )
    })
})

it('clears transient danger and charged shots when the same identity is restored', () => {
    const actor = abilityHero()
    const state = actor.progression.constellations
    state.lowHpFromHostile = true
    state.lowHpAwarded = true
    state.hostileWound = 20
    state.runicShotUntil = 5000
    restoreCharacter(actor, 1000, true)
    expect(state.lowHpFromHostile).toBe(false)
    expect(state.lowHpAwarded).toBe(false)
    expect(state.hostileWound).toBe(0)
    expect(state.runicShotUntil).toBe(0)
})
